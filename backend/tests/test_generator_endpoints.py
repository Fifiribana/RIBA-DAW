"""Tests for RIBA Magic Generator endpoints (iteration_13)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"


# --- generate-lyrics ---
class TestGenerateLyrics:
    def test_lyrics_returns_structured_payload(self):
        r = requests.post(f"{API}/generate-lyrics", json={
            "prompt": "phoenix rising over Yaoundé",
            "style": "Bikutsi",
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "title" in data and isinstance(data["title"], str) and len(data["title"]) > 0
        assert "sections" in data and isinstance(data["sections"], list) and len(data["sections"]) >= 1
        assert "tags" in data and isinstance(data["tags"], list)
        assert "fallback" in data and isinstance(data["fallback"], bool)
        assert "id" in data and isinstance(data["id"], str)
        # if fallback was used, spec says at least 3 sections
        if data["fallback"]:
            assert len(data["sections"]) >= 3, f"Fallback should return >=3 sections, got {len(data['sections'])}"

    def test_lyrics_persists_in_workspace(self):
        r = requests.post(f"{API}/generate-lyrics", json={
            "prompt": "TEST_lyrics_persistence_marker",
            "style": "Rumba",
        }, timeout=60)
        assert r.status_code == 200
        new_id = r.json()["id"]
        ws = requests.get(f"{API}/workspace", timeout=15).json()
        ids = [it.get("id") for it in ws["items"]]
        assert new_id in ids


# --- generate-track ---
class TestGenerateTrack:
    def test_track_returns_fal_key_missing_fallback(self):
        r = requests.post(f"{API}/generate-track", json={
            "prompt": "groovy bikutsi",
            "style": "Bikutsi",
            "duration_seconds": 15,
            "instrumental": True,
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("fallback") is True
        assert data.get("fallback_reason") == "FAL_KEY_MISSING"
        assert "id" in data and isinstance(data["id"], str)
        assert data.get("audio_url") in (None, "")

    def test_track_card_appears_in_workspace(self):
        r = requests.post(f"{API}/generate-track", json={
            "prompt": "TEST_track_marker afro groove",
            "style": "Afrobeat",
            "duration_seconds": 10,
            "instrumental": True,
        }, timeout=60)
        new_id = r.json()["id"]
        ws = requests.get(f"{API}/workspace", timeout=15).json()
        match = [it for it in ws["items"] if it.get("id") == new_id]
        assert len(match) == 1
        assert match[0].get("kind") == "music"
        assert match[0].get("fallback") is True


# --- workspace CRUD ---
class TestWorkspace:
    def test_workspace_list_shape(self):
        r = requests.get(f"{API}/workspace", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)

    def test_delete_removes_entry(self):
        # create a fresh lyrics card
        r = requests.post(f"{API}/generate-lyrics", json={
            "prompt": "TEST_delete_target soukous moonlight",
            "style": "Soukous",
        }, timeout=60)
        target = r.json()["id"]
        # ensure it exists
        ws_before = requests.get(f"{API}/workspace", timeout=15).json()
        assert any(it.get("id") == target for it in ws_before["items"])
        # delete
        d = requests.delete(f"{API}/workspace/{target}", timeout=15)
        assert d.status_code == 200
        dj = d.json()
        assert dj.get("deleted") == target
        assert "remaining" in dj and isinstance(dj["remaining"], int)
        # confirm gone
        ws_after = requests.get(f"{API}/workspace", timeout=15).json()
        assert not any(it.get("id") == target for it in ws_after["items"])

    def test_workspace_file_404_for_lyrics(self):
        # lyrics entries have no .wav -> 404
        r = requests.post(f"{API}/generate-lyrics", json={
            "prompt": "TEST_no_wav_marker",
            "style": "Highlife",
        }, timeout=60)
        lyrics_id = r.json()["id"]
        fr = requests.get(f"{API}/workspace/file/{lyrics_id}", timeout=15)
        assert fr.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
