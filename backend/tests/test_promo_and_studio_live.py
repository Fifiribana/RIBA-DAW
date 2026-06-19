"""Promo Cascade + Studio Live Session tests (CHANTIER 9)."""
import asyncio
import json
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
LOCAL = "http://localhost:8001/api"


def _library_ids(n: int = 3) -> list[str]:
    items = requests.get(f"{API}/ai/library", timeout=10).json()["items"]
    return [it["id"] for it in items[:n]]


class TestPromoCascade:
    def test_cascade_pack_only_when_no_creds(self):
        ids = _library_ids(3)
        r = requests.post(
            f"{LOCAL}/ai/promo-cascade",
            json={
                "track_ids":   ids,
                "title":       "Pytest Cascade",
                "style_label": "Bantu Drop Map",
                "platforms":   ["tiktok"],
                "micro_duration_sec": 5,
            },
            timeout=180,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("cascade_id", "teaser", "micro_reels", "schedule", "jobs_queued", "status", "platforms_ready", "start_at", "schedule_offsets_days"):
            assert k in d, f"missing {k}"
        # 3 micro reels with the proper labels
        labels = [m["label"] for m in d["micro_reels"]]
        assert labels == ["Peak", "Drop", "Hook"]
        for m in d["micro_reels"]:
            assert m["mp4_url"].startswith("/api/ai/workspace/reel/")
            assert m["mp4_bytes"] > 0
        # 4 schedule entries × 1 platform = 4 entries
        assert len(d["schedule"]) == 4
        # No creds → pack_only, no jobs queued
        assert d["jobs_queued"] == 0
        assert d["status"] == "pack_only"
        assert d["schedule_offsets_days"] == [0, 2, 4, 6]
        # Cleanup
        requests.delete(f"{API}/ai/workspace/reel/album_{d['teaser']['id']}.mp4", timeout=10)
        for m in d["micro_reels"]:
            requests.delete(f"{API}/ai/ workspace/reel/{m['mp4_url'].rsplit('/', 1)[-1]}", timeout=10)

    def test_cascade_validation_errors(self):
        # empty tracks
        r = requests.post(f"{LOCAL}/ai/promo-cascade", json={"track_ids": []}, timeout=10)
        assert r.status_code == 400
        # bad schedule length
        ids = _library_ids(2)
        r = requests.post(f"{LOCAL}/ai/promo-cascade",
                          json={"track_ids": ids, "schedule": [0, 2, 4]}, timeout=10)
        assert r.status_code == 400
        # unknown platform
        r = requests.post(f"{LOCAL}/ai/promo-cascade",
                          json={"track_ids": ids, "platforms": ["myspace"]}, timeout=10)
        assert r.status_code == 400


class TestStudioLiveSessions:
    def test_sessions_endpoint_initially_empty(self):
        r = requests.get(f"{API}/sessions", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "sessions" in d and "total_sessions" in d and "total_peers" in d

    @pytest.mark.asyncio
    async def test_websocket_relay_2_clients(self):
        """Two clients in the same session must receive each other's bytes."""
        try:
            import websockets  # type: ignore
        except ImportError:
            pytest.skip("websockets package not installed")
            return
        ws_url = BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/ws/session/pytest_alpha"
        async with websockets.connect(ws_url) as a, websockets.connect(ws_url) as b:
            # Give the second peer a moment to register
            await asyncio.sleep(0.2)
            # Broadcast some bytes from A → B should receive them
            payload = b"\x01\x02RIBA-test"
            await a.send(payload)
            recv = await asyncio.wait_for(b.recv(), timeout=5)
            assert recv == payload
            # Text presence frame B → A
            await b.send("presence:{\"name\":\"Mbappe\"}")
            txt = await asyncio.wait_for(a.recv(), timeout=5)
            assert "Mbappe" in txt

    def test_sessions_listed_during_connection(self):
        """The /sessions endpoint must return at least the session we just opened."""
        try:
            import websockets  # type: ignore
        except ImportError:
            pytest.skip("websockets package not installed")
            return

        async def _run() -> dict:
            ws_url = BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/ws/session/pytest_beta"
            async with websockets.connect(ws_url) as _:
                await asyncio.sleep(0.3)
                return requests.get(f"{API}/sessions", timeout=10).json()

        d = asyncio.run(_run())
        sids = [s["session_id"] for s in d["sessions"]]
        assert "pytest_beta" in sids, f"session not listed: {d}"
