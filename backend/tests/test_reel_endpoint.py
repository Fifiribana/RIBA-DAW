"""Bantu Reel endpoint tests (CHANTIER 5)."""
import io
import math
import os
import struct
import wave

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
# Use localhost for the POST since ffmpeg+CQT rendering may exceed ~1-5s and we
# don't want the public ingress involved here.
LOCAL = "http://localhost:8001/api/ai"
API = f"{BASE_URL}/api/ai"


def _tiny_harmonic_wav(seconds: float = 3.0, sr: int = 44100) -> bytes:
    n = int(seconds * sr)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        for i in range(n):
            t = i / sr
            s = 0.30 * math.sin(2 * math.pi * 220 * t) + 0.20 * math.sin(2 * math.pi * 440 * t)
            v = int(s * 28000)
            w.writeframesraw(struct.pack("<hh", v, v))
    return buf.getvalue()


class TestReelStatus:
    def test_reel_status_shape(self):
        r = requests.get(f"{API}/reel-status", timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("available", "ffmpeg_version", "formats", "max_duration_sec", "watermark", "default_format"):
            assert k in d, f"missing key {k}"
        assert d["available"] is True
        assert "ffmpeg" in (d.get("ffmpeg_version") or "").lower()
        assert "square_1080" in d["formats"]
        assert "reel_1080" in d["formats"]
        assert d["default_format"] == "square_1080"
        assert "RIBA" in d["watermark"]


class TestBantuReel:
    def test_reel_unknown_format_returns_400(self):
        r = requests.post(
            f"{LOCAL}/bantu-reel",
            files={"file": ("x.wav", b"\x00" * 100, "audio/wav")},
            data={"format": "not_a_format", "style_label": "Bikutsi 4/4", "title": "x", "duration_max_sec": "5", "with_mp3": "false"},
            timeout=30,
        )
        assert r.status_code == 400
        assert "not_a_format" in str(r.json().get("detail", ""))

    def test_reel_no_file_returns_422(self):
        r = requests.post(f"{LOCAL}/bantu-reel", data={"format": "square_1080"}, timeout=15)
        assert r.status_code == 422

    def test_reel_generates_mp4_and_mp3(self):
        """Full pipeline : harmonic 3s WAV → 1080×1080 MP4 + MP3, ~1-3 s on CPU."""
        wav = _tiny_harmonic_wav(seconds=3.0)
        r = requests.post(
            f"{LOCAL}/bantu-reel",
            files={"file": ("harm.wav", wav, "audio/wav")},
            data={
                "format": "square_1080",
                "style_label": "Bikutsi 4/4",
                "title": "Test Phoenix",
                "duration_max_sec": "5",
                "with_mp3": "true",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("id", "format", "width", "height", "duration", "title", "style_label", "watermark", "mp4_url", "mp4_bytes"):
            assert k in d, f"missing key {k}"
        assert d["width"] == 1080 and d["height"] == 1080
        assert d["mp4_url"].startswith("/api/ai/workspace/reel/")
        assert d["mp4_bytes"] > 10_000  # at least a few KB
        # MP3 should also be present
        assert d.get("mp3_url", "").startswith("/api/ai/workspace/reel/")
        assert d.get("mp3_bytes", 0) > 1_000

        # The MP4 must be downloadable via the public ingress too
        mp4 = requests.get(f"{BASE_URL}{d['mp4_url']}", timeout=20)
        assert mp4.status_code == 200
        assert mp4.headers.get("content-type", "").startswith("video/")
        assert len(mp4.content) == d["mp4_bytes"]

        # Cleanup: delete the reel via DELETE
        del_resp = requests.delete(f"{API}/workspace/reel/{d['id']}.mp4", timeout=10)
        assert del_resp.status_code == 200
        assert del_resp.json().get("existed") is True

    def test_reel_path_traversal_blocked(self):
        r = requests.get(f"{API}/workspace/reel/..%2F..%2Fetc%2Fpasswd", timeout=10)
        # Either 400 (rejected by validator) or 404 (path didn't match)
        assert r.status_code in (400, 404)
