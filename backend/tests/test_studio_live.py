"""Backend tests for RIBA Studio Live WebSocket relay + session listing."""
import os
import pytest
import requests
import time

try:
    from websockets.sync.client import connect as ws_connect  # type: ignore
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = API.replace("https://", "wss://").replace("http://", "ws://")


def _new_session_id() -> str:
    """Disposable session id to avoid collisions across parallel CI runs."""
    return f"pytest-{os.getpid()}-{int(time.time() * 1000)}"


class TestSessionsRest:
    def test_list_sessions_shape(self):
        r = requests.get(f"{API}/sessions", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data and isinstance(data["sessions"], list)
        assert isinstance(data["total_sessions"], int)
        assert isinstance(data["total_peers"], int)
        for s in data["sessions"]:
            assert "session_id" in s and isinstance(s["session_id"], str)
            assert isinstance(s["peers"], int) and s["peers"] >= 1


@pytest.mark.skipif(not HAS_WEBSOCKETS, reason="websockets library not installed")
class TestStudioLiveSocket:
    def _ws_url(self, session_id: str) -> str:
        return f"{WS_BASE}/ws/session/{session_id}"

    def test_two_peers_connect_and_listed(self):
        sid = _new_session_id()
        with ws_connect(self._ws_url(sid), open_timeout=10) as ws_a:
            with ws_connect(self._ws_url(sid), open_timeout=10) as ws_b:
                # Give the backend a tick to register both peers
                time.sleep(0.5)
                r = requests.get(f"{API}/sessions", timeout=10)
                assert r.status_code == 200
                sessions = {s["session_id"]: s["peers"] for s in r.json()["sessions"]}
                assert sid in sessions, f"session {sid} not in {sessions}"
                assert sessions[sid] == 2

    def test_binary_frames_broadcast(self):
        """Y.js sends binary protocol frames — the relay must forward them
        as-is to every other peer without parsing.
        """
        sid = _new_session_id()
        payload = bytes([0x01, 0x02, 0xFE, 0xFD, 0x42])
        with ws_connect(self._ws_url(sid), open_timeout=10) as ws_a, \
             ws_connect(self._ws_url(sid), open_timeout=10) as ws_b:
            time.sleep(0.4)  # let the server register both peers
            ws_a.send(payload)
            received = ws_b.recv(timeout=5)
            assert isinstance(received, (bytes, bytearray)), f"got {type(received)}"
            assert bytes(received) == payload

    def test_sender_does_not_receive_own_frame(self):
        sid = _new_session_id()
        with ws_connect(self._ws_url(sid), open_timeout=10) as ws_a, \
             ws_connect(self._ws_url(sid), open_timeout=10) as ws_b:
            time.sleep(0.4)
            ws_a.send(b"\x10\x20\x30")
            # Drain the other peer
            _ = ws_b.recv(timeout=5)
            # The sender should NOT get its own frame echoed (small timeout)
            with pytest.raises(Exception):
                ws_a.recv(timeout=0.6)

    def test_text_frames_broadcast(self):
        """Awareness/presence layers can also send text frames — must be
        relayed identically (no JSON parsing).
        """
        sid = _new_session_id()
        msg = '{"cursor":{"bar":4,"beat":0.5}}'
        with ws_connect(self._ws_url(sid), open_timeout=10) as ws_a, \
             ws_connect(self._ws_url(sid), open_timeout=10) as ws_b:
            time.sleep(0.4)
            ws_a.send(msg)
            received = ws_b.recv(timeout=5)
            assert isinstance(received, str), f"got {type(received)}"
            assert received == msg

    def test_session_cleared_when_last_peer_leaves(self):
        sid = _new_session_id()
        with ws_connect(self._ws_url(sid), open_timeout=10):
            time.sleep(0.3)
            r1 = requests.get(f"{API}/sessions", timeout=10).json()
            assert sid in {s["session_id"] for s in r1["sessions"]}
        # After context exit -> connection closed
        time.sleep(0.6)
        r2 = requests.get(f"{API}/sessions", timeout=10).json()
        assert sid not in {s["session_id"] for s in r2["sessions"]}, (
            f"session {sid} should be cleaned up but still present in {r2}"
        )
