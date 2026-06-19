"""
RIBA Studio Live Session — WebRTC/Y.js collaboration relay.

A minimal WebSocket relay that broadcasts the raw Y.js protocol bytes between
all peers in the same session. Y.js handles the CRDT logic on the client side
so the backend only has to forward messages and track presence.

Endpoints :
    WS  /api/ws/session/{session_id}     → join a session
    GET /api/sessions                    → list active sessions + peer counts
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["studio-live"])
log = logging.getLogger("riba.studio_live")

# session_id -> set of connected WebSocket peers
_PEERS: dict[str, set[WebSocket]] = defaultdict(set)
_LOCK = asyncio.Lock()
_BIRTH: dict[str, str] = {}        # creation timestamp per session


@router.websocket("/ws/session/{session_id}")
async def studio_live_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    async with _LOCK:
        _PEERS[session_id].add(websocket)
        if session_id not in _BIRTH:
            _BIRTH[session_id] = datetime.now(timezone.utc).isoformat()
        n_peers = len(_PEERS[session_id])

    log.info("session %s · peer joined · total=%d", session_id, n_peers)
    try:
        # NB : do NOT send JSON/text frames here — clients use the Y.js protocol
        # (binary only) and would crash on JSON. Peer presence is exposed via
        # GET /api/sessions and via y-protocol awareness messages.
        while True:
            try:
                msg = await websocket.receive()
            except WebSocketDisconnect:
                break
            if msg.get("type") == "websocket.disconnect":
                break
            # Forward both binary (Y.js protocol) and text (presence) frames to all other peers
            if "bytes" in msg and msg["bytes"] is not None:
                await _broadcast(session_id, exclude=websocket, message_bytes=msg["bytes"])
            elif "text" in msg and msg["text"] is not None:
                await _broadcast(session_id, exclude=websocket, message_text=msg["text"])
    finally:
        async with _LOCK:
            _PEERS[session_id].discard(websocket)
            remaining = len(_PEERS[session_id])
            if remaining == 0:
                del _PEERS[session_id]
                _BIRTH.pop(session_id, None)
        log.info("session %s · peer left · remaining=%d", session_id, remaining)
        if remaining > 0:
            # No JSON broadcast (would break y-websocket peers); they will detect
            # the disconnect via their awareness layer.
            pass


async def _broadcast(session_id: str, *, exclude: WebSocket | None,
                     message_bytes: bytes | None = None,
                     message_text: str | None = None,
                     message_json: dict | None = None) -> None:
    peers = list(_PEERS.get(session_id, set()))
    dead: list[WebSocket] = []
    for p in peers:
        if p is exclude:
            continue
        try:
            if message_bytes is not None:
                await p.send_bytes(message_bytes)
            elif message_text is not None:
                await p.send_text(message_text)
            elif message_json is not None:
                await p.send_json(message_json)
        except Exception:
            dead.append(p)
    if dead:
        async with _LOCK:
            for p in dead:
                _PEERS[session_id].discard(p)


@router.get("/sessions")
def list_sessions():
    return {
        "sessions": [
            {
                "session_id": sid,
                "peers":      len(peers),
                "created_at": _BIRTH.get(sid),
            }
            for sid, peers in _PEERS.items()
        ],
        "total_sessions": len(_PEERS),
        "total_peers":    sum(len(s) for s in _PEERS.values()),
    }
