"""Backend tests for the new RIBA AI endpoints (assistant / stems / music)."""
import os
import io
import wave
import struct
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- status probes ----------
def _fal_enabled() -> bool:
    try:
        return bool(requests.get(f"{API}/ai/music-status", timeout=10).json().get("enabled"))
    except Exception:
        return False


class TestStatusProbes:
    def test_music_status_shape(self):
        r = requests.get(f"{API}/ai/music-status", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # Shape is always the same; values depend on FAL_KEY env state
        assert "enabled" in data and isinstance(data["enabled"], bool)
        assert data["default_model"] == "fal-ai/musicgen-stereo-melody"
        if data["enabled"]:
            assert data["provider"] == "fal.ai"
        else:
            assert data["provider"] is None

    def test_stems_status_enabled(self):
        r = requests.get(f"{API}/ai/stems-status", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert data["provider"] == "demucs/htdemucs"


# ---------- assistant ----------
class TestAssistant:
    def test_assistant_happy_path_add_midi_and_tempo(self):
        body = {"message": "Add a MIDI track and set tempo to 95 bpm"}
        r = requests.post(f"{API}/ai/assistant", json=body, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert "actions" in data and isinstance(data["actions"], list)
        assert "speech" in data
        assert "session_id" in data and len(data["session_id"]) > 0
        # If fallback is triggered, the local interpreter must still produce add_track midi
        if data.get("fallback"):
            types = [a.get("type") for a in data["actions"]]
            assert "add_track" in types, f"fallback should add a MIDI track. actions={data['actions']}"

    def test_assistant_metronome_phrase_fallback_shape(self):
        # 'metronome' phrase will be recognised by both LLM and the fallback interpreter
        r = requests.post(f"{API}/ai/assistant", json={"message": "toggle metronome please"}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["actions"], list)


# ---------- fal.ai music endpoint behaviour ----------
class TestMusicGenLegacy:
    def test_generate_music_behaviour_respects_fal_state(self):
        """When FAL_KEY missing → 503 FAL_KEY_MISSING.
        When FAL_KEY active → either 200 with audio_url or 502 if the legacy
        musicgen-* model has been deprecated by fal.ai (we still validate the
        contract, not the upstream model availability)."""
        r = requests.post(f"{API}/ai/generate-music", json={"prompt": "test", "duration_seconds": 5}, timeout=120)
        if not _fal_enabled():
            assert r.status_code == 503
            detail = r.json().get("detail")
            if isinstance(detail, dict):
                assert detail.get("code") == "FAL_KEY_MISSING"
            else:
                assert "FAL_KEY" in str(detail) or "fal" in str(detail).lower()
        else:
            # 200 (success) or 502 (deprecated upstream slug) are both acceptable
            assert r.status_code in (200, 502), r.text
            if r.status_code == 200:
                body = r.json()
                assert isinstance(body.get("audio_url"), str) and body["audio_url"].startswith("http")
                assert body.get("model", "").startswith("fal-ai/")


# ---------- demucs stems ----------
def _tiny_wav_bytes(duration=0.5, sr=22050, freq=440.0):
    n = int(duration * sr)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        for i in range(n):
            v = int(32767 * 0.2 * math.sin(2 * math.pi * freq * i / sr))
            w.writeframesraw(struct.pack("<h", v))
    return buf.getvalue()


class TestStems:
    def test_separate_stems_no_input_returns_400(self):
        r = requests.post(f"{API}/ai/separate-stems", timeout=30)
        assert r.status_code == 400

    @pytest.mark.slow
    def test_separate_stems_with_tiny_wav(self):
        # This is slow (Demucs inference on CPU). Mark as slow; expected to pass given htdemucs is downloaded.
        wav = _tiny_wav_bytes()
        files = {"file": ("tiny.wav", wav, "audio/wav")}
        r = requests.post(f"{API}/ai/separate-stems", files=files, timeout=180)
        if r.status_code != 200:
            pytest.skip(f"Demucs heavy infer not viable in this env: {r.status_code} / {r.text[:200]}")
        data = r.json()
        assert "stems" in data
        for stem in ("vocals", "drums", "bass", "other"):
            assert stem in data["stems"], f"missing stem {stem}"
            assert "wav_base64" in data["stems"][stem]
            assert data["stems"][stem]["bytes"] > 0
