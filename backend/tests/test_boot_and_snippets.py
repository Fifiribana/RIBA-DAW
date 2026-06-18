"""Boot Cinematic + Reel Snippet Picker tests (CHANTIER 6)."""
import io
import math
import os
import struct
import wave

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"
LOCAL = "http://localhost:8001/api/ai"


def _three_zone_wav(seconds: float = 30.0, sr: int = 44100) -> bytes:
    """30s WAV with quiet vocals → loud full-band → bass-heavy bantu zone."""
    n = int(seconds * sr)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        for i in range(n):
            t = i / sr
            if t < seconds / 3:
                s = 0.16 * math.sin(2 * math.pi * 800 * t)
            elif t < 2 * seconds / 3:
                s = 0.55 * math.sin(2 * math.pi * 120 * t) + 0.45 * math.sin(2 * math.pi * 800 * t)
            else:
                s = 0.60 * math.sin(2 * math.pi * 70 * t) + 0.50 * math.sin(2 * math.pi * 110 * t)
            v = int(max(-0.95, min(0.95, s)) * 30000)
            w.writeframesraw(struct.pack("<hh", v, v))
    return buf.getvalue()


class TestBootCinematic:
    def test_boot_cinematic_default(self):
        r = requests.post(
            f"{LOCAL}/boot-cinematic",
            data={"duration": "4", "format": "landscape_1080", "with_drone": "true"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("id", "kind", "format", "width", "height", "duration", "subtitles", "with_drone", "mp4_url", "mp4_bytes"):
            assert k in d, f"missing key {k}"
        assert d["kind"] == "boot_cinematic"
        assert d["width"] == 1920 and d["height"] == 1080
        assert d["with_drone"] is True
        assert len(d["subtitles"]) == 3
        assert "Yaound" in d["subtitles"][0]
        assert "Bantu Oral Grid" in d["subtitles"][-1]
        assert d["mp4_bytes"] > 10_000
        # Downloadable via public ingress
        mp4 = requests.get(f"{BASE_URL}{d['mp4_url']}", timeout=20)
        assert mp4.status_code == 200
        assert mp4.headers.get("content-type", "").startswith("video/")
        # Cleanup
        fname = d["mp4_url"].rsplit("/", 1)[-1]
        del_r = requests.delete(f"{API}/workspace/reel/{fname}", timeout=10)
        assert del_r.status_code == 200

    def test_boot_cinematic_custom_subtitles(self):
        r = requests.post(
            f"{LOCAL}/boot-cinematic",
            data={
                "duration": "3",
                "format": "square_1080",
                "subtitles_csv": "Pioneered in Yaoundé|Bantu Oral Grid|RIBA Studio",
                "with_drone": "false",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subtitles"] == ["Pioneered in Yaoundé", "Bantu Oral Grid", "RIBA Studio"]
        assert d["with_drone"] is False
        # Cleanup
        fname = d["mp4_url"].rsplit("/", 1)[-1]
        requests.delete(f"{API}/workspace/reel/{fname}", timeout=10)

    def test_boot_cinematic_bad_format(self):
        r = requests.post(
            f"{LOCAL}/boot-cinematic",
            data={"duration": "4", "format": "bad_format"},
            timeout=15,
        )
        assert r.status_code == 400


class TestReelSnippets:
    def test_snippets_3_candidates(self):
        wav = _three_zone_wav(seconds=30.0)
        r = requests.post(
            f"{LOCAL}/reel-snippets",
            files={"file": ("3z.wav", wav, "audio/wav")},
            data={"window_sec": "8"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("duration", "sample_rate", "window_sec", "candidates"):
            assert k in d, f"missing key {k}"
        assert d["sample_rate"] == 44100
        assert abs(d["duration"] - 30.0) < 0.5
        assert d["window_sec"] == 8
        assert len(d["candidates"]) == 3
        names = {c["name"] for c in d["candidates"]}
        assert names == {"peak_energy", "bantu_drop", "main_hook"}
        # Each candidate has the right fields
        for c in d["candidates"]:
            assert "label" in c and "start_sec" in c and "score" in c and "score_norm" in c
            assert 0 <= c["start_sec"] <= d["duration"] - d["window_sec"]
            assert 0.0 <= c["score_norm"] <= 1.0
        # Peak energy should land in the loud middle/end zones (≥ 10s into a 30s file)
        peak = next(c for c in d["candidates"] if c["name"] == "peak_energy")
        assert peak["start_sec"] >= 8.0

    def test_snippets_short_input_full_track(self):
        wav = _three_zone_wav(seconds=8.0)
        r = requests.post(
            f"{LOCAL}/reel-snippets",
            files={"file": ("s.wav", wav, "audio/wav")},
            data={"window_sec": "30"},  # window > duration → single candidate
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert len(d["candidates"]) == 1
        assert d["candidates"][0]["name"] == "full_track"
        assert d["candidates"][0]["start_sec"] == 0.0

    def test_snippets_window_out_of_range(self):
        wav = _three_zone_wav(seconds=5.0)
        r = requests.post(
            f"{LOCAL}/reel-snippets",
            files={"file": ("x.wav", wav, "audio/wav")},
            data={"window_sec": "3"},  # < 5
            timeout=15,
        )
        assert r.status_code == 400

    def test_snippets_no_file_returns_422(self):
        r = requests.post(f"{LOCAL}/reel-snippets", data={"window_sec": "30"}, timeout=15)
        assert r.status_code == 422


class TestReelStartSec:
    def test_bantu_reel_accepts_start_sec(self):
        wav = _three_zone_wav(seconds=20.0)
        r = requests.post(
            f"{LOCAL}/bantu-reel",
            files={"file": ("seek.wav", wav, "audio/wav")},
            data={
                "format": "square_1080",
                "style_label": "Bikutsi 4/4",
                "title": "Seek Test",
                "duration_max_sec": "6",
                "start_sec": "10.5",
                "with_mp3": "false",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_sec"] == 10.5
        assert d["duration"] == 6
        fname = d["mp4_url"].rsplit("/", 1)[-1]
        requests.delete(f"{API}/workspace/reel/{fname}", timeout=10)
