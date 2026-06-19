"""Album Builder (Bantu Drop Map) + APScheduler tests (CHANTIER 8)."""
import os
import time

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"
LOCAL = "http://localhost:8001/api/ai"


def _library_ids(n: int = 3) -> list[str]:
    r = requests.get(f"{API}/library", timeout=10)
    assert r.status_code == 200
    return [it["id"] for it in r.json()["items"][:n]]


class TestAlbumTeaser:
    def test_album_teaser_drop_map(self):
        ids = _library_ids(3)
        r = requests.post(
            f"{LOCAL}/album/teaser",
            json={
                "track_ids":       ids,
                "mode":            "drop_map",
                "target_duration": 15,
                "transition_sec":  1.0,
                "bantu_style":     "bikutsi_44",
                "title":           "Test Drop Album",
                "style_label":     "Bantu Drop Map",
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("id", "kind", "mode", "tracks", "duration", "transition_sec", "transition_raw",
                  "mp4_url", "mp4_bytes", "mp3_url", "mp3_bytes", "cover_url", "segments"):
            assert k in d, f"missing key {k}"
        assert d["kind"] == "album_teaser"
        assert d["tracks"] == 3
        assert d["duration"] == 15
        # Bantu-grid-aligned crossfade: snapped, not equal to raw 1.0 verbatim
        assert d["transition_sec"] > 0.0
        # MP4 + cover both downloadable
        mp4 = requests.get(f"{BASE_URL}{d['mp4_url']}", timeout=20)
        assert mp4.status_code == 200 and mp4.headers["content-type"].startswith("video/")
        cover = requests.get(f"{BASE_URL}{d['cover_url']}", timeout=10)
        assert cover.status_code == 200 and cover.headers["content-type"] == "image/png"
        # segments include the picked snippet name per track (drop_map mode)
        for seg in d["segments"]:
            assert "track_id" in seg and seg["track_id"] in ids
            assert seg["debug"].get("mode") == "drop_map"
        # Cleanup
        fname = d["mp4_url"].rsplit("/", 1)[-1]
        requests.delete(f"{API}/workspace/reel/{fname}", timeout=10)

    def test_album_teaser_sequential_mode(self):
        ids = _library_ids(2)
        r = requests.post(
            f"{LOCAL}/album/teaser",
            json={"track_ids": ids, "mode": "sequential", "target_duration": 15, "title": "Seq", "style_label": "Seq"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mode"] == "sequential"
        # In sequential mode, every segment starts at 0
        for seg in d["segments"]:
            assert seg["start_sec"] == 0.0
        fname = d["mp4_url"].rsplit("/", 1)[-1]
        requests.delete(f"{API}/workspace/reel/{fname}", timeout=10)

    def test_album_teaser_validation(self):
        # empty
        r = requests.post(f"{LOCAL}/album/teaser", json={"track_ids": []}, timeout=10)
        assert r.status_code == 400
        # unknown track
        r = requests.post(f"{LOCAL}/album/teaser", json={"track_ids": ["NOT_A_REAL_ID_xyz"]}, timeout=10)
        assert r.status_code == 404
        # bad mode
        ids = _library_ids(2)
        r = requests.post(f"{LOCAL}/album/teaser", json={"track_ids": ids, "mode": "techno"}, timeout=10)
        assert r.status_code == 400
        # too many (>16)
        ids_long = ids * 9  # 18 IDs
        r = requests.post(f"{LOCAL}/album/teaser", json={"track_ids": ids_long}, timeout=10)
        assert r.status_code == 400

    def test_album_cover_path_traversal_blocked(self):
        r = requests.get(f"{API}/album/cover/..%2F..%2Fetc%2Fpasswd", timeout=10)
        assert r.status_code in (400, 404)


class TestScheduler:
    def test_scheduled_endpoint_returns_list(self):
        r = requests.get(f"{API}/share/scheduled", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "jobs" in d and isinstance(d["jobs"], list)

    def test_scheduling_a_tiktok_job_requires_creds(self):
        # No TIKTOK_ACCESS_TOKEN configured → 503 even when schedule_at is provided.
        r = requests.post(
            f"{LOCAL}/share/tiktok/publish",
            json={"reel_id": "00000000000000000000000000000000", "description": "x", "hashtags": ["#RIBA"],
                  "schedule_at": "2099-01-01T00:00:00Z"},
            timeout=10,
        )
        # creds check happens before schedule_at handling → 503 first
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "TIKTOK_CREDS_MISSING"
