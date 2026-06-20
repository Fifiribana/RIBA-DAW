"""Tests for MIDI Learn (Sprint v3.9) — PATCH/DELETE /api/midi/mapping/{owner}/learn."""
import os
import uuid

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _owner() -> str:
    return f"learn_{uuid.uuid4().hex[:8]}"


# === Single-binding insertion (the canonical MIDI Learn flow) ================
def test_midi_learn_creates_first_cc_binding():
    owner = _owner()
    payload = {"owner": owner, "kind": "cc", "controller": 22, "action": "track.42.volume"}
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["saved"] is True
    assert data["binding"] == {"kind": "cc", "key": "22", "action": "track.42.volume"}
    assert data["cc"]["22"] == "track.42.volume"
    # No legacy notes were stored
    assert data["notes"] == {}


def test_midi_learn_creates_first_noteon_binding():
    owner = _owner()
    payload = {"owner": owner, "kind": "noteon", "pitch": 36, "action": "transport.record"}
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json=payload, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["notes"]["36"] == "transport.record"
    assert data["cc"] == {}


def test_midi_learn_incremental_appends_without_dropping_prior_bindings():
    owner = _owner()
    # Add 3 CC bindings + 1 note binding, one PATCH at a time
    seq = [
        ("cc", 16, "tempo.set"),
        ("cc", 17, "swing.intensity"),
        ("noteon", 36, "transport.record"),
        ("cc", 7, "master.volume"),
    ]
    for kind, num, action in seq:
        body = {"owner": owner, "kind": kind, "action": action}
        body["pitch" if kind == "noteon" else "controller"] = num
        r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json=body, timeout=10)
        assert r.status_code == 200, r.text

    # Final state — verify all bindings still present
    r = requests.get(f"{API}/midi/mapping/{owner}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["fallback"] is False
    assert data["cc"]["16"]  == "tempo.set"
    assert data["cc"]["17"]  == "swing.intensity"
    assert data["cc"]["7"]   == "master.volume"
    assert data["notes"]["36"] == "transport.record"


def test_midi_learn_overrides_same_controller():
    owner = _owner()
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 21, "action": "track.1.volume",
    }, timeout=10)
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 21, "action": "track.2.volume",
    }, timeout=10)
    assert r.status_code == 200
    assert r.json()["cc"]["21"] == "track.2.volume"


# === Validation ==============================================================
def test_midi_learn_rejects_owner_mismatch():
    r = requests.patch(f"{API}/midi/mapping/aaa/learn", json={
        "owner": "bbb", "kind": "cc", "controller": 7, "action": "x.y",
    }, timeout=10)
    assert r.status_code == 400


def test_midi_learn_rejects_noteon_without_pitch():
    owner = _owner()
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "noteon", "action": "transport.play",
    }, timeout=10)
    assert r.status_code == 422


def test_midi_learn_rejects_cc_without_controller():
    owner = _owner()
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "action": "tempo.set",
    }, timeout=10)
    assert r.status_code == 422


def test_midi_learn_rejects_unknown_kind():
    owner = _owner()
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "aftertouch", "pitch": 60, "action": "x.y",
    }, timeout=10)
    assert r.status_code == 422


def test_midi_learn_rejects_pitch_out_of_range():
    owner = _owner()
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "noteon", "pitch": 200, "action": "x.y",
    }, timeout=10)
    assert r.status_code == 422


def test_midi_learn_rejects_empty_action():
    owner = _owner()
    r = requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 7, "action": "",
    }, timeout=10)
    assert r.status_code == 422


# === Targeted unbind =========================================================
def test_midi_learn_unbind_removes_single_cc():
    owner = _owner()
    # Seed 2 CC bindings
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 16, "action": "tempo.set",
    }, timeout=10)
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 7, "action": "master.volume",
    }, timeout=10)

    # Remove just CC 16
    r = requests.delete(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 16,
    }, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "16" not in data["cc"]
    assert data["cc"]["7"] == "master.volume"


def test_midi_learn_unbind_full_reset():
    owner = _owner()
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "noteon", "pitch": 60, "action": "transport.play",
    }, timeout=10)
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 17, "action": "swing.intensity",
    }, timeout=10)
    r = requests.delete(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner,
    }, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["cleared"] == "all"
    assert data["notes"] == {}
    assert data["cc"] == {}


def test_midi_learn_unbind_owner_mismatch():
    r = requests.delete(f"{API}/midi/mapping/aaa/learn", json={"owner": "bbb"}, timeout=10)
    assert r.status_code == 400


# === Cross-feature: learn then recall =========================================
def test_midi_learn_persisted_mapping_survives_reload():
    owner = _owner()
    requests.patch(f"{API}/midi/mapping/{owner}/learn", json={
        "owner": owner, "kind": "cc", "controller": 99, "action": "track.99.pan",
    }, timeout=10)
    # Fresh recall (no caching)
    r = requests.get(f"{API}/midi/mapping/{owner}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["fallback"] is False
    assert data["cc"]["99"] == "track.99.pan"
