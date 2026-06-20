"""
RIBA MIDI — WebMIDI session analytics & default control mapping.

Pure metadata routes: the actual MIDI traffic is handled in the browser via the
WebMIDI API for low-latency. The backend exposes:

- `GET  /api/midi/status`            → capability snapshot for the client.
- `GET  /api/midi/mapping/default`   → factory control map (notes + CCs).
- `POST /api/midi/mapping`           → persist a user's mapping override.
- `GET  /api/midi/mapping/{owner}`   → recall a previously saved mapping.
- `POST /api/midi/session`           → log a MIDI session for analytics.
- `GET  /api/midi/session/recent`    → list latest sessions.

Storage is intentionally lightweight (one document per mapping owner, capped
event count for sessions) so it never grows unbounded.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Path
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/midi", tags=["midi-input"])


# === Mongo handle ============================================================
# Lazy: tests can import the module without a live MONGO_URL.
_client: Optional[AsyncIOMotorClient] = None


def _db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client[os.environ["DB_NAME"]]


# === Default factory control map =============================================
# Standard MMC-style notes for transport. CCs picked from the most common
# master-keyboard knob layouts (e.g. Akai MPK mini, Novation Launchkey).
DEFAULT_MAPPING = {
    "version": 1,
    "notes": {
        "60": "transport.play",       # C4
        "61": "transport.stop",       # C#4
        "62": "transport.record",     # D4
        "63": "transport.loop",       # D#4
        "64": "transport.metronome",  # E4
    },
    "cc": {
        # ch1 CC# → action
        "16": "tempo.set",          # macro-knob 1 → tempo (40..240 BPM)
        "17": "swing.intensity",    # macro-knob 2 → 0..100 %
        "18": "swing.enable",       # toggle Bantu Swing Live (>=64 = ON)
        "19": "swing.style",        # 0..127 sliced into 5 Bantu styles
        "7":  "master.volume",      # standard CC7 (channel volume)
        "1":  "master.pan",         # mod wheel → pan (-1..+1)
    },
    "styles": [
        "asiko_wisdom",
        "makossa_roots",
        "bikutsi_44",
        "bikutsi_68",
        "bikutsi_1224",
    ],
    "tempo_range": [40, 240],
    "low_latency_target_ms": 12,
}


def _slice_style(cc_value: int) -> str:
    """Map a 0..127 CC value into one of the 5 Bantu styles, inclusive."""
    styles = DEFAULT_MAPPING["styles"]
    value = max(0, min(127, int(cc_value)))
    bucket = min(len(styles) - 1, value * len(styles) // 128)
    return styles[bucket]


def _cc_to_tempo(cc_value: int) -> int:
    """Map a 0..127 CC value into the user-visible tempo range."""
    lo, hi = DEFAULT_MAPPING["tempo_range"]
    value = max(0, min(127, int(cc_value)))
    return int(round(lo + (hi - lo) * (value / 127.0)))


def _cc_to_pan(cc_value: int) -> float:
    """Map a 0..127 CC value into a balanced pan in [-1, +1]."""
    value = max(0, min(127, int(cc_value)))
    return round((value / 127.0) * 2.0 - 1.0, 4)


# === Pydantic models ==========================================================
_OWNER_RE = re.compile(r"^[A-Za-z0-9_\-]{1,48}$")


class MidiSession(BaseModel):
    """Snapshot of a WebMIDI capture session (logged anonymously)."""

    owner: str = Field("anonymous", description="Client identifier / griot tag.")
    device_name: str = Field("", description="MIDI device name as exposed by the browser.")
    event_count: int = Field(0, ge=0, le=100_000)
    note_count: int = Field(0, ge=0, le=100_000)
    cc_count: int = Field(0, ge=0, le=100_000)
    duration_ms: int = Field(0, ge=0, le=24 * 60 * 60 * 1000)
    bantu_style: Optional[str] = Field(None, description="Style locked in during the take.")
    tempo: Optional[int] = Field(None, ge=20, le=400)
    swing_intensity: Optional[float] = Field(None, ge=0.0, le=1.0)
    avg_latency_ms: Optional[float] = Field(None, ge=0.0, le=2000.0)

    @field_validator("owner")
    @classmethod
    def _validate_owner(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            return "anonymous"
        if not _OWNER_RE.match(v):
            raise ValueError("owner must match [A-Za-z0-9_-]{1,48}")
        return v

    @field_validator("bantu_style")
    @classmethod
    def _validate_style(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if v not in DEFAULT_MAPPING["styles"]:
            raise ValueError(f"unknown bantu_style: {v}")
        return v


class MidiMappingPayload(BaseModel):
    """User-controlled override of the default control mapping."""

    owner: str = Field(..., description="Owner key, [A-Za-z0-9_-]{1,48}.")
    notes: dict = Field(default_factory=dict)
    cc: dict = Field(default_factory=dict)

    @field_validator("owner")
    @classmethod
    def _validate_owner(cls, v: str) -> str:
        if not v or not _OWNER_RE.match(v.strip()):
            raise ValueError("owner must match [A-Za-z0-9_-]{1,48}")
        return v.strip()

    @field_validator("notes")
    @classmethod
    def _validate_notes(cls, v: dict) -> dict:
        clean: dict[str, str] = {}
        for k, action in v.items():
            try:
                pitch = int(k)
            except (TypeError, ValueError):
                raise ValueError(f"note key must be 0..127, got {k!r}")
            if pitch < 0 or pitch > 127:
                raise ValueError(f"note pitch out of range: {pitch}")
            if not isinstance(action, str) or not action:
                raise ValueError(f"action for note {pitch} must be non-empty string")
            clean[str(pitch)] = action[:64]
        return clean

    @field_validator("cc")
    @classmethod
    def _validate_cc(cls, v: dict) -> dict:
        clean: dict[str, str] = {}
        for k, action in v.items():
            try:
                num = int(k)
            except (TypeError, ValueError):
                raise ValueError(f"CC key must be 0..127, got {k!r}")
            if num < 0 or num > 127:
                raise ValueError(f"CC number out of range: {num}")
            if not isinstance(action, str) or not action:
                raise ValueError(f"action for CC {num} must be non-empty string")
            clean[str(num)] = action[:64]
        return clean


# === Routes ===================================================================
@router.get("/status")
async def midi_status() -> dict:
    """Snapshot of MIDI capability — purely advisory for clients."""
    return {
        "supported": True,
        "transport_actions": [
            "transport.play",
            "transport.stop",
            "transport.record",
            "transport.loop",
            "transport.metronome",
        ],
        "macro_actions": [
            "tempo.set",
            "swing.intensity",
            "swing.enable",
            "swing.style",
            "master.volume",
            "master.pan",
        ],
        "styles": DEFAULT_MAPPING["styles"],
        "tempo_range": DEFAULT_MAPPING["tempo_range"],
        "low_latency_target_ms": DEFAULT_MAPPING["low_latency_target_ms"],
    }


@router.get("/mapping/default")
async def midi_mapping_default() -> dict:
    """Return the factory-default control mapping."""
    return DEFAULT_MAPPING


@router.post("/mapping")
async def midi_mapping_save(payload: MidiMappingPayload) -> dict:
    """Persist a per-owner mapping (full replace, upsert)."""
    doc = {
        "owner": payload.owner,
        "notes": payload.notes,
        "cc": payload.cc,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db().midi_mappings.update_one(
        {"owner": payload.owner}, {"$set": doc}, upsert=True
    )
    return {"saved": True, "owner": payload.owner, "notes": payload.notes, "cc": payload.cc}


@router.get("/mapping/{owner}")
async def midi_mapping_get(owner: str = Path(..., min_length=1, max_length=48)) -> dict:
    """Recall a stored mapping or fall back to the factory default."""
    if not _OWNER_RE.match(owner):
        raise HTTPException(status_code=400, detail="invalid owner key")
    doc = await _db().midi_mappings.find_one({"owner": owner}, {"_id": 0})
    if not doc:
        return {"owner": owner, "fallback": True, **DEFAULT_MAPPING}
    return {"fallback": False, **doc}


# === MIDI Learn (Sprint v3.9) ================================================
class MidiLearnBinding(BaseModel):
    """Single MIDI Learn assignment — merged into a stored mapping."""

    owner: str = Field(..., description="Owner key, [A-Za-z0-9_-]{1,48}.")
    kind: str = Field(..., description="'noteon' or 'cc'.")
    # Either pitch (for noteon) OR controller (for cc) — depending on `kind`.
    pitch: Optional[int] = Field(None, ge=0, le=127)
    controller: Optional[int] = Field(None, ge=0, le=127)
    action: str = Field(..., min_length=1, max_length=64,
                        description="Dotted action key e.g. 'track.42.volume'.")

    @field_validator("owner")
    @classmethod
    def _validate_owner(cls, v: str) -> str:
        if not v or not _OWNER_RE.match(v.strip()):
            raise ValueError("owner must match [A-Za-z0-9_-]{1,48}")
        return v.strip()

    @field_validator("kind")
    @classmethod
    def _validate_kind(cls, v: str) -> str:
        if v not in ("noteon", "cc"):
            raise ValueError("kind must be 'noteon' or 'cc'")
        return v

    def assert_consistent(self) -> None:
        """Ensure pitch/controller match the declared kind."""
        if self.kind == "noteon" and self.pitch is None:
            raise HTTPException(422, "noteon binding requires pitch (0..127)")
        if self.kind == "cc" and self.controller is None:
            raise HTTPException(422, "cc binding requires controller (0..127)")


class MidiLearnClear(BaseModel):
    """Targeted removal of a single binding (or all if no target supplied)."""

    owner: str
    kind: Optional[str] = Field(None, description="'noteon' | 'cc' | None for full reset.")
    pitch: Optional[int] = Field(None, ge=0, le=127)
    controller: Optional[int] = Field(None, ge=0, le=127)

    @field_validator("owner")
    @classmethod
    def _validate_owner(cls, v: str) -> str:
        if not v or not _OWNER_RE.match(v.strip()):
            raise ValueError("owner must match [A-Za-z0-9_-]{1,48}")
        return v.strip()


@router.patch("/mapping/{owner}/learn")
async def midi_learn_bind(
    binding: MidiLearnBinding,
    owner: str = Path(..., min_length=1, max_length=48),
) -> dict:
    """Merge a single new binding into the stored mapping (creates if absent).

    Existing entries for the same pitch/controller are overwritten; everything
    else is preserved — that's the whole point of MIDI Learn: incremental.
    """
    if owner != binding.owner:
        raise HTTPException(400, "owner in path and payload must match")
    if not _OWNER_RE.match(owner):
        raise HTTPException(400, "invalid owner key")
    binding.assert_consistent()

    key = str(binding.pitch if binding.kind == "noteon" else binding.controller)
    field = "notes" if binding.kind == "noteon" else "cc"

    # Two-step upsert so Mongo never sees a $set + $setOnInsert collision on
    # the same dotted path:
    #   1. Ensure the document exists with both maps initialised.
    #   2. Write the new binding inside the appropriate map.
    now = datetime.now(timezone.utc).isoformat()
    await _db().midi_mappings.update_one(
        {"owner": owner},
        {
            "$setOnInsert": {
                "owner": owner,
                "notes": {},
                "cc": {},
                "created_at": now,
            },
        },
        upsert=True,
    )
    await _db().midi_mappings.update_one(
        {"owner": owner},
        {"$set": {f"{field}.{key}": binding.action, "updated_at": now}},
    )
    doc = await _db().midi_mappings.find_one({"owner": owner}, {"_id": 0}) or {}
    return {
        "saved": True,
        "owner": owner,
        "binding": {
            "kind": binding.kind,
            "key": key,
            "action": binding.action,
        },
        "notes": doc.get("notes", {}),
        "cc": doc.get("cc", {}),
    }


@router.delete("/mapping/{owner}/learn")
async def midi_learn_unbind(
    payload: MidiLearnClear,
    owner: str = Path(..., min_length=1, max_length=48),
) -> dict:
    """Remove a single binding, or wipe the whole mapping when no target is given."""
    if owner != payload.owner:
        raise HTTPException(400, "owner in path and payload must match")
    if not _OWNER_RE.match(owner):
        raise HTTPException(400, "invalid owner key")

    if payload.kind is None:
        # Full reset: clear both dicts but keep the doc so subsequent PATCH still
        # finds an owner row.
        await _db().midi_mappings.update_one(
            {"owner": owner},
            {"$set": {"notes": {}, "cc": {}, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return {"cleared": "all", "owner": owner, "notes": {}, "cc": {}}

    if payload.kind == "noteon":
        if payload.pitch is None:
            raise HTTPException(422, "noteon unbind requires pitch")
        key = str(payload.pitch)
        field = "notes"
    elif payload.kind == "cc":
        if payload.controller is None:
            raise HTTPException(422, "cc unbind requires controller")
        key = str(payload.controller)
        field = "cc"
    else:
        raise HTTPException(422, f"unknown kind: {payload.kind!r}")

    await _db().midi_mappings.update_one(
        {"owner": owner},
        {"$unset": {f"{field}.{key}": ""},
         "$set":   {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc = await _db().midi_mappings.find_one({"owner": owner}, {"_id": 0}) or {}
    return {
        "cleared": {"kind": payload.kind, "key": key},
        "owner": owner,
        "notes": doc.get("notes", {}),
        "cc": doc.get("cc", {}),
    }


@router.post("/session")
async def midi_session_log(session: MidiSession) -> dict:
    """Log a finished MIDI take for analytics & later remixing."""
    doc = {
        **session.model_dump(),
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db().midi_sessions.insert_one(doc)
    doc.pop("_id", None)
    return {"saved": True, "session": doc}


@router.get("/session/recent")
async def midi_session_recent(limit: int = 20) -> dict:
    """List the most recent MIDI sessions, capped at 100."""
    limit = max(1, min(100, int(limit)))
    cursor = _db().midi_sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(limit)
    return {"sessions": items, "count": len(items)}


# Helpers exported for tests
__all__ = [
    "router",
    "DEFAULT_MAPPING",
    "_slice_style",
    "_cc_to_tempo",
    "_cc_to_pan",
]
