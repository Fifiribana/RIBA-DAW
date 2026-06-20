"""Tests for /api/sessions/presence (Sprint v3.13 — Onboarding & Presence)."""
import os

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def test_presence_endpoint_shape():
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    # Required keys (snapshot for client to render)
    for k in ("griots_online", "active_sessions", "solo_count",
              "collab_count", "poll_interval_ms"):
        assert k in data, f"missing key: {k}"


def test_presence_counters_are_nonnegative_integers():
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    data = r.json()
    for k in ("griots_online", "active_sessions", "solo_count", "collab_count"):
        assert isinstance(data[k], int)
        assert data[k] >= 0


def test_presence_poll_interval_sane_default():
    """Poll interval must be a positive integer of milliseconds — clients use
    it directly to setInterval(). Reject anything < 1s (would hammer the API)
    and > 60s (would feel stale)."""
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    poll = r.json()["poll_interval_ms"]
    assert isinstance(poll, int)
    assert 1_000 <= poll <= 60_000


def test_presence_collab_le_active_sessions():
    """A `collab_count` (2+-peer rooms) can never exceed `active_sessions`."""
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    data = r.json()
    assert data["collab_count"] <= data["active_sessions"]


def test_presence_solo_plus_collab_equals_active():
    """The two breakdown counts must add up to the total active rooms."""
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    data = r.json()
    assert data["solo_count"] + data["collab_count"] == data["active_sessions"]


def test_presence_griots_online_ge_active_sessions():
    """Each active session has ≥ 1 peer, so total peers ≥ active sessions."""
    r = requests.get(f"{API}/sessions/presence", timeout=10)
    data = r.json()
    assert data["griots_online"] >= data["active_sessions"]


def test_presence_endpoint_independent_from_legacy_sessions_list():
    """Hitting /sessions and /sessions/presence in the same beat must agree
    on the peer total — they read from the same in-memory _PEERS dict."""
    r1 = requests.get(f"{API}/sessions", timeout=10).json()
    r2 = requests.get(f"{API}/sessions/presence", timeout=10).json()
    # Snapshots may differ slightly across requests because connections drop
    # in real-time. Accept a ±1 tolerance.
    assert abs(r1["total_peers"] - r2["griots_online"]) <= 1
