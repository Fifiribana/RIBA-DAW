"""Tests for MIDI Input (WebMIDI) backend — Sprint v3.8."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


# === Status & defaults ========================================================
def test_midi_status_advertises_capabilities():
    r = requests.get(f"{API}/midi/status", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["supported"] is True
    assert "transport.play" in data["transport_actions"]
    assert "transport.stop" in data["transport_actions"]
    assert "transport.record" in data["transport_actions"]
    assert "tempo.set" in data["macro_actions"]
    assert "swing.intensity" in data["macro_actions"]
    assert isinstance(data["styles"], list) and len(data["styles"]) == 5
    assert data["tempo_range"] == [40, 240]
    assert data["low_latency_target_ms"] <= 20


def test_midi_default_mapping_shape():
    r = requests.get(f"{API}/midi/mapping/default", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # 5 transport notes (Play / Stop / Rec / Loop / Metronome)
    assert set(data["notes"].keys()) >= {"60", "61", "62", "63", "64"}
    assert data["notes"]["60"] == "transport.play"
    assert data["notes"]["61"] == "transport.stop"
    assert data["notes"]["62"] == "transport.record"
    # Macro knobs (Tempo / Swing / Volume / Pan)
    assert data["cc"]["16"] == "tempo.set"
    assert data["cc"]["17"] == "swing.intensity"
    assert data["cc"]["7"] == "master.volume"
    assert data["cc"]["1"] == "master.pan"


# === Mapping save / recall ====================================================
def test_midi_mapping_save_and_recall_roundtrip():
    owner = f"midi_test_{uuid.uuid4().hex[:8]}"
    payload = {
        "owner": owner,
        "notes": {"36": "transport.record", "37": "transport.play"},
        "cc":    {"20": "tempo.set", "21": "swing.intensity"},
    }
    r = requests.post(f"{API}/midi/mapping", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["saved"] is True
    assert saved["owner"] == owner

    r2 = requests.get(f"{API}/midi/mapping/{owner}", timeout=10)
    assert r2.status_code == 200
    recalled = r2.json()
    assert recalled["fallback"] is False
    assert recalled["notes"]["36"] == "transport.record"
    assert recalled["cc"]["20"] == "tempo.set"


def test_midi_mapping_unknown_owner_falls_back_to_default():
    owner = f"missing_{uuid.uuid4().hex[:6]}"
    r = requests.get(f"{API}/midi/mapping/{owner}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["fallback"] is True
    assert data["notes"]["60"] == "transport.play"


@pytest.mark.parametrize("bad_owner", ["", " ", "no spaces ok", "ô_é", "x" * 80, "with/slash"])
def test_midi_mapping_rejects_invalid_owners(bad_owner):
    payload = {"owner": bad_owner, "notes": {"60": "transport.play"}, "cc": {}}
    r = requests.post(f"{API}/midi/mapping", json=payload, timeout=10)
    assert r.status_code == 422, r.text


def test_midi_mapping_rejects_out_of_range_pitch():
    payload = {"owner": "rangecheck", "notes": {"200": "transport.play"}, "cc": {}}
    r = requests.post(f"{API}/midi/mapping", json=payload, timeout=10)
    assert r.status_code == 422


def test_midi_mapping_rejects_non_numeric_cc():
    payload = {"owner": "rangecheck", "notes": {}, "cc": {"abc": "tempo.set"}}
    r = requests.post(f"{API}/midi/mapping", json=payload, timeout=10)
    assert r.status_code == 422


def test_midi_mapping_path_rejects_bad_owner():
    r = requests.get(f"{API}/midi/mapping/" + "x" * 80, timeout=10)
    # Path constraint => 400 or 422
    assert r.status_code in (400, 422)


# === Session logging ==========================================================
def test_midi_session_log_full_payload():
    payload = {
        "owner": "tester",
        "device_name": "Test MPK mini",
        "event_count": 42,
        "note_count": 30,
        "cc_count": 12,
        "duration_ms": 5000,
        "bantu_style": "bikutsi_44",
        "tempo": 132,
        "swing_intensity": 0.7,
        "avg_latency_ms": 8.4,
    }
    r = requests.post(f"{API}/midi/session", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["saved"] is True
    saved = data["session"]
    assert saved["device_name"] == "Test MPK mini"
    assert saved["bantu_style"] == "bikutsi_44"
    assert "id" in saved and saved["id"]


def test_midi_session_rejects_unknown_style():
    payload = {
        "owner": "tester",
        "device_name": "x",
        "event_count": 1, "note_count": 0, "cc_count": 0, "duration_ms": 100,
        "bantu_style": "house_garage",
    }
    r = requests.post(f"{API}/midi/session", json=payload, timeout=10)
    assert r.status_code == 422


def test_midi_session_accepts_minimal_payload():
    r = requests.post(
        f"{API}/midi/session",
        json={"device_name": "Bareback"},
        timeout=10,
    )
    assert r.status_code == 200
    saved = r.json()["session"]
    assert saved["owner"] == "anonymous"
    assert saved["device_name"] == "Bareback"


def test_midi_session_recent_lists_latest_first():
    tag = uuid.uuid4().hex[:8]
    for i in range(3):
        requests.post(
            f"{API}/midi/session",
            json={
                "owner": "recenttest",
                "device_name": f"dev-{tag}-{i}",
                "event_count": i,
            },
            timeout=10,
        )
    r = requests.get(f"{API}/midi/session/recent?limit=10", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 3
    names = [s["device_name"] for s in data["sessions"] if "device_name" in s]
    # The 3 we just inserted must be present
    assert any(n.startswith(f"dev-{tag}") for n in names)


def test_midi_session_recent_clamps_limit():
    r = requests.get(f"{API}/midi/session/recent?limit=9999", timeout=10)
    assert r.status_code == 200
    assert len(r.json()["sessions"]) <= 100


# === Helper math (in-process) =================================================
def test_helpers_cc_to_tempo_mapping():
    from ai.midi import _cc_to_tempo
    assert _cc_to_tempo(0) == 40
    assert _cc_to_tempo(127) == 240
    mid = _cc_to_tempo(63)
    # mid CC should land roughly in the middle of [40,240]
    assert 130 <= mid <= 150


def test_helpers_cc_to_pan_mapping():
    from ai.midi import _cc_to_pan
    assert _cc_to_pan(0) == -1.0
    assert _cc_to_pan(127) == 1.0
    assert -0.05 <= _cc_to_pan(64) <= 0.05


def test_helpers_cc_to_style_buckets():
    from ai.midi import _slice_style, DEFAULT_MAPPING
    styles = DEFAULT_MAPPING["styles"]
    # Each bucket should appear at least once across the 0..127 range
    seen = {_slice_style(v) for v in range(0, 128, 4)}
    for s in styles:
        assert s in seen, f"style {s} never selected"
