"""Tests for MIDI Snapshot Library (Sprint v3.10)."""
import os
import uuid

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _owner() -> str:
    return f"snap_{uuid.uuid4().hex[:8]}"


# === Create / list / read =====================================================
def test_snapshot_save_creates_first():
    owner = _owner()
    payload = {
        "owner": owner,
        "name": "Home Studio",
        "notes": {"36": "transport.record", "60": "transport.play"},
        "cc":    {"16": "tempo.set", "17": "swing.intensity"},
    }
    r = requests.post(f"{API}/midi/snapshots", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["saved"] is True
    snap = data["snapshot"]
    assert snap["owner"] == owner
    assert snap["name"] == "Home Studio"
    assert snap["notes"]["36"] == "transport.record"
    assert snap["cc"]["17"] == "swing.intensity"
    assert snap["shared"] is False
    assert snap["id"]


def test_snapshot_save_upserts_by_owner_name():
    owner = _owner()
    base = {"owner": owner, "name": "MPK mini", "notes": {}, "cc": {"16": "tempo.set"}}
    # First save
    r1 = requests.post(f"{API}/midi/snapshots", json=base, timeout=10)
    id1 = r1.json()["snapshot"]["id"]
    # Second save with same (owner,name) but different mapping
    base["cc"] = {"16": "tempo.set", "7": "master.volume"}
    r2 = requests.post(f"{API}/midi/snapshots", json=base, timeout=10)
    assert r2.status_code == 200
    snap = r2.json()["snapshot"]
    # Same id → no duplicate rows
    assert snap["id"] == id1
    assert snap["cc"]["7"] == "master.volume"


def test_snapshot_save_distinct_names_keep_separate_rows():
    owner = _owner()
    for name in ("Studio A", "Studio B", "Live Tour"):
        r = requests.post(f"{API}/midi/snapshots", json={
            "owner": owner, "name": name, "notes": {}, "cc": {},
        }, timeout=10)
        assert r.status_code == 200
    r = requests.get(f"{API}/midi/snapshots?owner={owner}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 3
    names = {s["name"] for s in data["snapshots"]}
    assert names == {"Studio A", "Studio B", "Live Tour"}


def test_snapshot_list_requires_owner():
    r = requests.get(f"{API}/midi/snapshots", timeout=10)
    assert r.status_code == 400


def test_snapshot_get_by_id_returns_full_payload():
    owner = _owner()
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "Recall test",
        "notes": {"60": "transport.play"}, "cc": {},
    }, timeout=10)
    sid = r.json()["snapshot"]["id"]
    r2 = requests.get(f"{API}/midi/snapshots/{sid}", timeout=10)
    assert r2.status_code == 200
    data = r2.json()
    assert data["id"] == sid
    assert data["notes"]["60"] == "transport.play"


def test_snapshot_get_unknown_id_returns_404():
    r = requests.get(f"{API}/midi/snapshots/{uuid.uuid4().hex}", timeout=10)
    assert r.status_code == 404


# === Validation ===============================================================
def test_snapshot_save_rejects_empty_name():
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": "tester", "name": "", "notes": {}, "cc": {},
    }, timeout=10)
    assert r.status_code == 422


def test_snapshot_save_rejects_too_long_name():
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": "tester", "name": "x" * 200, "notes": {}, "cc": {},
    }, timeout=10)
    assert r.status_code == 422


def test_snapshot_save_rejects_invalid_chars_in_name():
    # Slash is reserved (path-injection guard)
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": "tester", "name": "with/slash", "notes": {}, "cc": {},
    }, timeout=10)
    assert r.status_code == 422


def test_snapshot_save_accepts_accented_name():
    """French/Spanish/Portuguese griot names must work."""
    owner = _owner()
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "Studio Yaoundé — Bantú Sessions",
        "notes": {}, "cc": {},
    }, timeout=10)
    assert r.status_code == 200, r.text


def test_snapshot_save_rejects_bad_pitch():
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": "tester", "name": "Test",
        "notes": {"200": "transport.play"}, "cc": {},
    }, timeout=10)
    assert r.status_code == 422


# === Sharing & public listing =================================================
def test_snapshot_share_toggles_flag():
    owner = _owner()
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "Shared Setup", "notes": {}, "cc": {"16": "tempo.set"},
    }, timeout=10)
    sid = r.json()["snapshot"]["id"]
    r2 = requests.post(
        f"{API}/midi/snapshots/{sid}/share",
        params={"owner": owner, "shared": "true", "share_label": "by Akong"},
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    snap = r2.json()["snapshot"]
    assert snap["shared"] is True
    assert snap["share_label"] == "by Akong"


def test_snapshot_share_requires_owner():
    r = requests.post(f"{API}/midi/snapshots/anything/share", timeout=10)
    assert r.status_code == 400


def test_snapshot_share_unknown_id_returns_404():
    r = requests.post(
        f"{API}/midi/snapshots/{uuid.uuid4().hex}/share",
        params={"owner": "tester", "shared": "true"},
        timeout=10,
    )
    assert r.status_code == 404


def test_snapshot_public_listing_returns_only_shared():
    tag = uuid.uuid4().hex[:8]
    owner = f"public_{tag}"
    # 2 snapshots, only one shared
    for i, (name, shared) in enumerate([(f"Pub-{tag}-A", True), (f"Pub-{tag}-B", False)]):
        r = requests.post(f"{API}/midi/snapshots", json={
            "owner": owner, "name": name, "notes": {}, "cc": {},
            "shared": shared,
        }, timeout=10)
        assert r.status_code == 200

    r = requests.get(f"{API}/midi/snapshots/public?limit=60", timeout=10)
    assert r.status_code == 200
    items = r.json()["snapshots"]
    names = [s["name"] for s in items]
    assert f"Pub-{tag}-A" in names
    assert f"Pub-{tag}-B" not in names


def test_snapshot_public_listing_omits_secret_mapping_fields():
    """Public list endpoint should NOT leak the full notes/cc dicts (lightweight metadata only)."""
    owner = _owner()
    requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": f"Pub-meta-{uuid.uuid4().hex[:6]}",
        "notes": {"60": "transport.play"}, "cc": {"16": "tempo.set"},
        "shared": True,
    }, timeout=10)
    r = requests.get(f"{API}/midi/snapshots/public?limit=60", timeout=10)
    items = r.json()["snapshots"]
    if items:
        for s in items:
            assert "notes" not in s
            assert "cc" not in s


# === Delete ===================================================================
def test_snapshot_delete_removes_doc():
    owner = _owner()
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "ToDelete", "notes": {}, "cc": {},
    }, timeout=10)
    sid = r.json()["snapshot"]["id"]
    r2 = requests.delete(
        f"{API}/midi/snapshots/{sid}", params={"owner": owner}, timeout=10,
    )
    assert r2.status_code == 200
    assert r2.json()["deleted"] is True
    # Subsequent GET should 404
    r3 = requests.get(f"{API}/midi/snapshots/{sid}", timeout=10)
    assert r3.status_code == 404


def test_snapshot_delete_wrong_owner_returns_404():
    owner = _owner()
    r = requests.post(f"{API}/midi/snapshots", json={
        "owner": owner, "name": "Mine", "notes": {}, "cc": {},
    }, timeout=10)
    sid = r.json()["snapshot"]["id"]
    r2 = requests.delete(
        f"{API}/midi/snapshots/{sid}",
        params={"owner": "someone_else"},
        timeout=10,
    )
    assert r2.status_code == 404
