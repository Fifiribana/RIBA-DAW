"""Generator extensions tests : custom title + upload-reference + library."""
import io
import math
import os
import struct
import wave

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"
LOCAL = "http://localhost:8001/api/ai"


def _tiny_wav(seconds: float = 1.0) -> bytes:
    sr = 44100
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        for i in range(int(seconds * sr)):
            v = int(math.sin(2 * math.pi * 440 * i / sr) * 25000)
            w.writeframesraw(struct.pack("<h", v))
    return buf.getvalue()


def _fal_enabled() -> bool:
    try:
        return bool(requests.get(f"{API}/music-status", timeout=10).json().get("enabled"))
    except Exception:
        return False


class TestLibrary:
    def test_library_lists_4_loops(self):
        r = requests.get(f"{API}/library", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 4
        # All have the curated fields
        names = {it["title"] for it in items}
        assert {"Bikutsi 4/4 Loop", "Makossa Roots Loop", "Asiko Wisdom Loop", "Afrobeat Groove Hit"} == names
        for it in items:
            assert it["kind"] == "library"
            assert it["audio_url"].startswith("/api/ai/workspace/file/")
            assert it["id"].startswith("LIB-")
            assert it["bpm"] > 0
            # Downloadable
            audio = requests.get(f"{BASE_URL}{it['audio_url']}", timeout=10)
            assert audio.status_code == 200
            assert audio.headers.get("content-type", "").startswith("audio/")


class TestUploadReference:
    def test_upload_wav_creates_workspace_entry(self):
        wav = _tiny_wav(1.0)
        r = requests.post(
            f"{LOCAL}/upload-reference",
            files={"file": ("guitar_idea.wav", wav, "audio/wav")},
            data={"title": "Guitar Idea", "kind": "upload", "tags_csv": "GUITAR,DEMO"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "upload"
        assert d["title"] == "Guitar Idea"
        assert d["user_title"] is True
        assert d["tags"] == ["GUITAR", "DEMO"]
        assert d["audio_url"].startswith("/api/ai/workspace/file/")
        assert d["bytes"] == len(wav)
        # File is downloadable
        audio = requests.get(f"{BASE_URL}{d['audio_url']}", timeout=10)
        assert audio.status_code == 200
        assert audio.headers.get("content-type", "").startswith("audio/")
        # Workspace lists it at the top
        ws = requests.get(f"{API}/workspace", timeout=10).json()["items"]
        match = [x for x in ws if x.get("id") == d["id"]]
        assert len(match) == 1
        # Cleanup
        requests.delete(f"{API}/workspace/{d['id']}", timeout=10)

    def test_voice_recording_default_title(self):
        wav = _tiny_wav(0.5)
        r = requests.post(
            f"{LOCAL}/upload-reference",
            files={"file": ("rec.webm", wav, "audio/webm")},
            data={"kind": "voice"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "voice"
        assert d["title"] == "Voice Memo"
        assert "VOICE" in d["tags"]
        requests.delete(f"{API}/workspace/{d['id']}", timeout=10)

    def test_upload_rejects_unsupported_extension(self):
        r = requests.post(
            f"{LOCAL}/upload-reference",
            files={"file": ("malicious.exe", b"MZ\x90\x00", "application/octet-stream")},
            data={"kind": "upload"},
            timeout=10,
        )
        assert r.status_code == 400
        assert ".exe" in str(r.json().get("detail", ""))

    def test_upload_rejects_empty_file(self):
        r = requests.post(
            f"{LOCAL}/upload-reference",
            files={"file": ("empty.wav", b"", "audio/wav")},
            data={"kind": "upload"},
            timeout=10,
        )
        # Either 400 (our check) or 422 if multipart treats it as missing — accept both
        assert r.status_code in (400, 422)

    def test_upload_rejects_invalid_kind(self):
        wav = _tiny_wav(0.5)
        r = requests.post(
            f"{LOCAL}/upload-reference",
            files={"file": ("x.wav", wav, "audio/wav")},
            data={"kind": "deepfake"},
            timeout=10,
        )
        assert r.status_code == 400


class TestGenerateTrackTitle:
    def test_user_title_overrides_local_title(self):
        # Only run in fal-key-missing mode to avoid hitting fal.ai for a unit test
        if _fal_enabled():
            # In fal-active mode we still send the request but assert via the workspace entry
            url = f"{LOCAL}/generate-track"
        else:
            url = f"{API}/generate-track"
        r = requests.post(
            url,
            json={
                "prompt": "ancient drums of the night",
                "style": "Bikutsi",
                "title": "Phoenix at Dawn",
                "duration_seconds": 6,
                "instrumental": True,
            },
            timeout=240,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("title") == "Phoenix at Dawn"
        assert d.get("user_title") is True
        # Cleanup
        requests.delete(f"{API}/workspace/{d['id']}", timeout=10)

    def test_default_title_when_not_provided(self):
        # Force fallback path : do not provide a title at all
        url = f"{LOCAL}/generate-track" if _fal_enabled() else f"{API}/generate-track"
        r = requests.post(
            url,
            json={
                "prompt": "smoky midnight session",
                "style": "Bikutsi",
                "duration_seconds": 6,
                "instrumental": True,
            },
            timeout=240,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("user_title") is False
        # Local title takes first 4 words → "Smoky Midnight Session"
        assert "Smoky" in d.get("title", "")
        requests.delete(f"{API}/workspace/{d['id']}", timeout=10)
