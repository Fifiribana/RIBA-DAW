"""
Backend API tests for Riba DAW.
Covers: health, dream generation (LLM with procedural fallback),
dream history, mastering, sessions CRUD, validation.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- HEALTH ----------------
class TestHealth:
    def test_health_ok(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert "time" in data


# ---------------- DREAM ----------------
class TestDream:
    def test_dream_generate_returns_notes(self, api):
        payload = {"prompt": "calm piano in C minor", "tempo": 110}
        r = api.post(f"{BASE_URL}/api/dream/generate", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("id", "name", "prompt", "notes", "description", "created_at"):
            assert k in data, f"missing key {k}"
        assert data["prompt"] == payload["prompt"]
        assert isinstance(data["notes"], list)
        assert len(data["notes"]) > 0
        n0 = data["notes"][0]
        for k in ("pitch", "velocity", "start", "duration"):
            assert k in n0
        assert isinstance(n0["pitch"], int)
        assert isinstance(n0["velocity"], int)
        # store for next test
        pytest.dream_id = data["id"]

    def test_dream_generate_empty_prompt_400(self, api):
        r = api.post(
            f"{BASE_URL}/api/dream/generate", json={"prompt": "  ", "tempo": 120}, timeout=15
        )
        assert r.status_code == 400

    def test_dream_history_contains_recent(self, api):
        r = api.get(f"{BASE_URL}/api/dream/history", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        it = items[0]
        for k in ("id", "prompt", "name", "description", "notes", "created_at"):
            assert k in it


# ---------------- MASTERING ----------------
class TestMastering:
    def test_mastering_suggest(self, api):
        r = api.post(
            f"{BASE_URL}/api/mastering/suggest",
            json={"track_descriptions": ["voice: vocal", "drums: kit"]},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], str)
        assert len(data["suggestions"]) > 0


# ---------------- SESSIONS ----------------
class TestSessions:
    def test_session_full_crud(self, api):
        # CREATE
        payload = {
            "name": "TEST_session_1",
            "tempo": 128,
            "master_volume": 75,
            "tracks": [{"id": "t1", "name": "voice", "type": "audio"}],
        }
        r = api.post(f"{BASE_URL}/api/session/save", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and "updated_at" in data
        sid = data["id"]

        # LIST
        r = api.get(f"{BASE_URL}/api/session/list", timeout=15)
        assert r.status_code == 200
        items = r.json()
        ids = [x.get("id") for x in items]
        assert sid in ids

        # GET
        r = api.get(f"{BASE_URL}/api/session/{sid}", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["name"] == "TEST_session_1"
        assert s["tempo"] == 128
        assert s["master_volume"] == 75
        assert len(s["tracks"]) == 1

        # UPDATE (same id)
        upd = dict(payload, id=sid, name="TEST_session_1_upd", tempo=140)
        r = api.post(f"{BASE_URL}/api/session/save", json=upd, timeout=15)
        assert r.status_code == 200
        r = api.get(f"{BASE_URL}/api/session/{sid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_session_1_upd"
        assert r.json()["tempo"] == 140

        # DELETE
        r = api.delete(f"{BASE_URL}/api/session/{sid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") == 1

        # GET should be 404
        r = api.get(f"{BASE_URL}/api/session/{sid}", timeout=15)
        assert r.status_code == 404

    def test_session_get_nonexistent_404(self, api):
        r = api.get(f"{BASE_URL}/api/session/nonexistent-id-xyz", timeout=15)
        assert r.status_code == 404
