"""Tests for Snapshot of the Week (Sprint v3.11) — featured / leaderboard / import counter."""
import os
import uuid

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _seed_shared_snapshot(owner: str, name: str) -> dict:
    """Create a shared snapshot ready for import testing."""
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": name,
        "notes": {"60": "transport.play"},
        "cc":    {"16": "tempo.set"},
        "shared": True,
        "share_label": f"by {owner}",
    }, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["snapshot"]


# === Import endpoint ==========================================================
def test_snapshot_import_increments_counter():
    owner = f"sotw_{uuid.uuid4().hex[:8]}"
    snap = _seed_shared_snapshot(owner, f"Trending-{uuid.uuid4().hex[:6]}")
    sid = snap["id"]

    # First import
    r = requests.post(f"{API}/midi/snapshots/{sid}/import", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["imported"] is True
    assert data["snapshot_id"] == sid
    assert data["import_count"] == 1
    assert data["last_imported_at"]

    # Second import should increment to 2
    r2 = requests.post(f"{API}/midi/snapshots/{sid}/import", timeout=10)
    assert r2.status_code == 200
    assert r2.json()["import_count"] == 2


def test_snapshot_import_rejects_private_snapshot():
    owner = f"sotw_{uuid.uuid4().hex[:8]}"
    # Create a *private* snapshot (shared=False)
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "Private Setup",
        "notes": {}, "cc": {}, "shared": False,
    }, timeout=10)
    sid = r.json()["snapshot"]["id"]
    r2 = requests.post(f"{API}/midi/snapshots/{sid}/import", timeout=10)
    assert r2.status_code == 403


def test_snapshot_import_unknown_id_returns_404():
    r = requests.post(f"{API}/midi/snapshots/{uuid.uuid4().hex}/import", timeout=10)
    assert r.status_code == 404


def test_snapshot_import_rejects_invalid_importer_key():
    owner = f"sotw_{uuid.uuid4().hex[:8]}"
    snap = _seed_shared_snapshot(owner, f"BadImporter-{uuid.uuid4().hex[:6]}")
    r = requests.post(
        f"{API}/midi/snapshots/{snap['id']}/import",
        params={"importer": "with/slash"},
        timeout=10,
    )
    assert r.status_code == 400


def test_snapshot_import_accepts_named_importer():
    owner = f"sotw_{uuid.uuid4().hex[:8]}"
    snap = _seed_shared_snapshot(owner, f"NamedImporter-{uuid.uuid4().hex[:6]}")
    r = requests.post(
        f"{API}/midi/snapshots/{snap['id']}/import",
        params={"importer": "akong_42"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["import_count"] >= 1


# === Featured banner ==========================================================
def test_featured_empty_when_no_imports_in_window():
    r = requests.get(f"{API}/midi/snapshots/featured?window_days=1", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # `featured` may be None (no imports in last day) or a real snapshot if
    # earlier tests ran <24h ago — both are valid, but the shape must match.
    assert "featured" in data
    assert data["window_days"] == 1
    assert "window_count" in data


def test_featured_picks_top_imported_snapshot():
    """Insert 3 snapshots with different import counts; the most-imported wins."""
    tag = uuid.uuid4().hex[:6]
    owner = f"sotw_top_{tag}"
    snaps = []
    for i in range(3):
        s = _seed_shared_snapshot(owner, f"Top-{tag}-{i}")
        snaps.append(s)

    # snap[0]: 1 import, snap[1]: 3 imports, snap[2]: 5 imports → snap[2] wins
    counts = [1, 3, 5]
    for snap, n in zip(snaps, counts):
        for _ in range(n):
            requests.post(f"{API}/midi/snapshots/{snap['id']}/import", timeout=10)

    r = requests.get(f"{API}/midi/snapshots/featured?window_days=7", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # The "Featured This Week" must be SOME shared snapshot, and its
    # window_count must be at least our top contribution (5). Other tests in
    # the same run may push the global top higher — that's fine.
    assert data["featured"] is not None
    assert data["window_count"] >= 5
    assert data["featured"]["shared"] is True


def test_featured_clamps_window_days():
    """Out-of-range window_days must be clamped (1..60)."""
    r = requests.get(f"{API}/midi/snapshots/featured?window_days=9999", timeout=10)
    assert r.status_code == 200
    assert r.json()["window_days"] == 60

    r2 = requests.get(f"{API}/midi/snapshots/featured?window_days=0", timeout=10)
    assert r2.status_code == 200
    assert r2.json()["window_days"] == 1


def test_featured_skips_unshared_snapshot():
    """If the most-imported snapshot gets unshared, featured must fall back."""
    tag = uuid.uuid4().hex[:6]
    owner = f"sotw_unsh_{tag}"
    snap = _seed_shared_snapshot(owner, f"WillUnshare-{tag}")
    # Many imports
    for _ in range(8):
        requests.post(f"{API}/midi/snapshots/{snap['id']}/import", timeout=10)
    # Then unshare it
    rs = requests.post(
        f"{API}/midi/snapshots/{snap['id']}/share",
        params={"owner": owner, "shared": "false"},
        timeout=10,
    )
    assert rs.status_code == 200
    # The /featured endpoint may still surface this snapshot ID via the
    # aggregate but the response handler must skip it (featured=None OR a
    # different shared snapshot, but never *this* one).
    r = requests.get(f"{API}/midi/snapshots/featured?window_days=7", timeout=10)
    data = r.json()
    if data["featured"]:
        assert data["featured"]["id"] != snap["id"]


# === Leaderboard ==============================================================
def test_leaderboard_returns_top_n_ordered():
    tag = uuid.uuid4().hex[:6]
    owner = f"sotw_lb_{tag}"
    snaps = []
    for i in range(3):
        s = _seed_shared_snapshot(owner, f"LB-{tag}-{i}")
        snaps.append(s)
    # imports: snap0=1, snap1=2, snap2=4
    for snap, n in zip(snaps, [1, 2, 4]):
        for _ in range(n):
            requests.post(f"{API}/midi/snapshots/{snap['id']}/import", timeout=10)

    r = requests.get(f"{API}/midi/snapshots/leaderboard?limit=20", timeout=10)
    assert r.status_code == 200
    data = r.json()
    lb = data["leaderboard"]
    assert isinstance(lb, list)
    # Find our 3 snapshot ids in the leaderboard and verify their relative
    # order — snap[2] (4 imports) must come before snap[1] (2) which must
    # come before snap[0] (1).
    positions = {}
    for idx, entry in enumerate(lb):
        for i, s in enumerate(snaps):
            if entry["id"] == s["id"]:
                positions[i] = idx
    if 0 in positions and 1 in positions and 2 in positions:
        assert positions[2] < positions[1] < positions[0]


def test_leaderboard_redacts_secret_fields():
    """The leaderboard payload must NEVER include notes/cc dicts."""
    r = requests.get(f"{API}/midi/snapshots/leaderboard?limit=20", timeout=10)
    assert r.status_code == 200
    for entry in r.json()["leaderboard"]:
        assert "notes" not in entry, f"notes leaked in leaderboard: {entry}"
        assert "cc" not in entry, f"cc leaked in leaderboard: {entry}"
        assert "window_count" in entry


def test_leaderboard_clamps_limit():
    r = requests.get(f"{API}/midi/snapshots/leaderboard?limit=9999", timeout=10)
    assert r.status_code == 200
    assert len(r.json()["leaderboard"]) <= 20


# === Cross-check =============================================================
def test_import_does_not_affect_unrelated_snapshots():
    """Importing snapshot A must not bump the counter on snapshot B."""
    tag = uuid.uuid4().hex[:6]
    owner = f"sotw_iso_{tag}"
    snap_a = _seed_shared_snapshot(owner, f"Iso-A-{tag}")
    snap_b = _seed_shared_snapshot(owner, f"Iso-B-{tag}")
    initial_b = snap_b.get("import_count", 0)

    requests.post(f"{API}/midi/snapshots/{snap_a['id']}/import", timeout=10)
    requests.post(f"{API}/midi/snapshots/{snap_a['id']}/import", timeout=10)

    # Fetch B by id — its counter should not have changed
    r = requests.get(f"{API}/midi/snapshots/{snap_b['id']}", timeout=10)
    assert r.status_code == 200
    assert r.json().get("import_count", 0) == initial_b
