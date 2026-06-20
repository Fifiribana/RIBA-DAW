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
from datetime import datetime, timedelta, timezone
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


# === MIDI Snapshot Library (Sprint v3.10) ====================================
# A *named* snapshot is a frozen copy of a user's mapping, optionally shared in
# the public Bantu Storytelling Library so other griots can download & apply it
# in one click. Storage doc shape:
#   { id, owner, name, notes, cc, shared, share_label, created_at, updated_at }
# Owner-scoped CRUD + a public listing for shared presets.

_SNAPSHOT_NAME_RE = re.compile(
    r"^[A-Za-z0-9 _\-\.\u00C0-\u024F\u1E00-\u1EFF\u2010-\u2015]{1,80}$"
)


class MidiSnapshotPayload(BaseModel):
    """Body for create / update of a named snapshot."""

    owner: str = Field(..., description="Owner key, [A-Za-z0-9_-]{1,48}.")
    name: str = Field(..., min_length=1, max_length=80,
                      description="Human-readable preset name.")
    notes: dict = Field(default_factory=dict)
    cc: dict = Field(default_factory=dict)
    shared: bool = Field(False, description="Whether to expose in the public library.")
    share_label: Optional[str] = Field(
        None, max_length=120,
        description="Optional tagline shown in the public Bantu Library card.",
    )

    @field_validator("owner")
    @classmethod
    def _validate_owner(cls, v: str) -> str:
        if not v or not _OWNER_RE.match(v.strip()):
            raise ValueError("owner must match [A-Za-z0-9_-]{1,48}")
        return v.strip()

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not _SNAPSHOT_NAME_RE.match(v):
            raise ValueError(
                "snapshot name must be 1..80 chars of letters, digits, "
                "spaces, hyphens, underscores or dots"
            )
        return v

    @field_validator("notes")
    @classmethod
    def _validate_notes(cls, v: dict) -> dict:
        clean = {}
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
        clean = {}
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


def _snapshot_view(doc: dict) -> dict:
    """Strip _id + redact for the wire."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


# Rolling window (in days) used by /snapshots/featured + /leaderboard.
_FEATURED_WINDOW_DAYS = 7


@router.post("/snapshots")
async def midi_snapshot_save(payload: MidiSnapshotPayload) -> dict:
    """Upsert a snapshot by (owner, name).

    Re-saving the same (owner,name) replaces in-place — no duplicate rows.
    """
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "$set": {
            "owner": payload.owner,
            "name": payload.name,
            "notes": payload.notes,
            "cc": payload.cc,
            "shared": bool(payload.shared),
            "share_label": (payload.share_label or "").strip()[:120] or None,
            "updated_at": now,
        },
        "$setOnInsert": {
            "id": str(uuid.uuid4()),
            "created_at": now,
        },
    }
    await _db().midi_snapshots.update_one(
        {"owner": payload.owner, "name": payload.name},
        update,
        upsert=True,
    )
    doc = await _db().midi_snapshots.find_one(
        {"owner": payload.owner, "name": payload.name}, {"_id": 0}
    )
    return {"saved": True, "snapshot": doc}


@router.get("/snapshots")
async def midi_snapshots_list(owner: str = "") -> dict:
    """List snapshots — owner-scoped, sorted newest first."""
    owner = (owner or "").strip()
    if not owner or not _OWNER_RE.match(owner):
        raise HTTPException(400, "owner query param is required")
    cursor = _db().midi_snapshots.find({"owner": owner}, {"_id": 0}).sort("updated_at", -1)
    items = await cursor.to_list(200)
    return {"owner": owner, "snapshots": items, "count": len(items)}


@router.get("/snapshots/public")
async def midi_snapshots_public(limit: int = 30) -> dict:
    """List shared snapshots for the public Bantu Storytelling Library card.

    Returns lightweight metadata only (no notes/cc by default) — clients fetch
    the full payload on demand via GET /api/midi/snapshots/{id}.
    """
    limit = max(1, min(60, int(limit)))
    cursor = (
        _db()
        .midi_snapshots.find(
            {"shared": True},
            {"_id": 0, "notes": 0, "cc": 0},
        )
        .sort("updated_at", -1)
        .limit(limit)
    )
    items = await cursor.to_list(limit)
    return {"snapshots": items, "count": len(items)}


@router.get("/snapshots/featured")
async def midi_snapshot_featured(window_days: int = _FEATURED_WINDOW_DAYS) -> dict:
    """Snapshot of the Week — most-imported shared preset over a rolling window.

    Returns the full snapshot doc + a count of imports in the window. The
    response is intentionally compact (single snapshot, no array) so the UI
    can drop it straight into a banner. When no imports happened in the
    window — or when every top candidate has since been un-shared — returns
    `featured=null` and the UI shows a neutral empty-state.
    """
    window_days = max(1, min(60, int(window_days)))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()

    # Fetch the top 20 candidates so we can fall through past any that were
    # later unshared/deleted (otherwise a single revoked snapshot would
    # silence the Featured banner entirely).
    pipeline = [
        {"$match": {"imported_at": {"$gte": cutoff}}},
        {"$group": {"_id": "$snapshot_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    candidates = await _db().midi_snapshot_imports.aggregate(pipeline).to_list(20)
    if not candidates:
        return {"featured": None, "window_days": window_days, "window_count": 0}

    for c in candidates:
        snap = await _db().midi_snapshots.find_one({"id": c["_id"]}, {"_id": 0})
        if snap and snap.get("shared"):
            return {
                "featured": snap,
                "window_days": window_days,
                "window_count": c["count"],
                "computed_at": datetime.now(timezone.utc).isoformat(),
            }
    return {"featured": None, "window_days": window_days, "window_count": 0}


@router.get("/snapshots/leaderboard")
async def midi_snapshot_leaderboard(
    window_days: int = _FEATURED_WINDOW_DAYS,
    limit: int = 10,
) -> dict:
    """Top-N most-imported shared snapshots over the rolling window.

    Same engine as /featured but returns an ordered list for a sidebar widget.
    """
    window_days = max(1, min(60, int(window_days)))
    limit = max(1, min(20, int(limit)))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    pipeline = [
        {"$match": {"imported_at": {"$gte": cutoff}}},
        {"$group": {"_id": "$snapshot_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    rows = await _db().midi_snapshot_imports.aggregate(pipeline).to_list(limit)
    if not rows:
        return {"leaderboard": [], "window_days": window_days}

    ids = [r["_id"] for r in rows]
    counts = {r["_id"]: r["count"] for r in rows}
    snaps_cursor = _db().midi_snapshots.find(
        {"id": {"$in": ids}, "shared": True},
        {"_id": 0, "notes": 0, "cc": 0},  # redact heavy fields
    )
    snaps = await snaps_cursor.to_list(limit)
    snaps_by_id = {s["id"]: s for s in snaps}
    # Preserve the leaderboard ordering returned by the aggregate.
    leaderboard = []
    for sid in ids:
        if sid in snaps_by_id:
            entry = {**snaps_by_id[sid], "window_count": counts[sid]}
            leaderboard.append(entry)
    return {"leaderboard": leaderboard, "window_days": window_days}


@router.get("/snapshots/{snapshot_id}")
async def midi_snapshot_get(snapshot_id: str = Path(..., min_length=8, max_length=64)) -> dict:
    """Fetch the full payload of a single snapshot by id (any owner — used by the
    public Library to let visitors apply a shared preset)."""
    doc = await _db().midi_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "snapshot not found")
    return doc
@router.delete("/snapshots/{snapshot_id}")
async def midi_snapshot_delete(snapshot_id: str = Path(..., min_length=8, max_length=64),
                                owner: str = "") -> dict:
    """Delete a snapshot owned by `owner`. 404 if mismatched or absent."""
    if not owner or not _OWNER_RE.match(owner):
        raise HTTPException(400, "owner query param is required")
    result = await _db().midi_snapshots.delete_one({"id": snapshot_id, "owner": owner})
    if result.deleted_count == 0:
        raise HTTPException(404, "snapshot not found for this owner")
    return {"deleted": True, "id": snapshot_id, "owner": owner}


@router.post("/snapshots/{snapshot_id}/share")
async def midi_snapshot_share(
    snapshot_id: str = Path(..., min_length=8, max_length=64),
    owner: str = "",
    shared: bool = True,
    share_label: Optional[str] = None,
) -> dict:
    """Toggle the public-sharing flag on a snapshot (owner-scoped)."""
    if not owner or not _OWNER_RE.match(owner):
        raise HTTPException(400, "owner query param is required")
    update = {"$set": {"shared": bool(shared), "updated_at": datetime.now(timezone.utc).isoformat()}}
    if share_label is not None:
        update["$set"]["share_label"] = (share_label or "").strip()[:120] or None
    result = await _db().midi_snapshots.update_one({"id": snapshot_id, "owner": owner}, update)
    if result.matched_count == 0:
        raise HTTPException(404, "snapshot not found for this owner")
    doc = await _db().midi_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    return {"shared": bool(shared), "snapshot": doc}


# === Snapshot of the Week (Sprint v3.11) =====================================
# Each public-snapshot import is logged with a timestamp so we can compute the
# top trending preset over a rolling 7-day window. The counter is denormalised
# onto the snapshot itself (import_count, last_imported_at) to keep the
# /featured query a single small aggregation rather than a per-doc rollup.


@router.post("/snapshots/{snapshot_id}/import")
async def midi_snapshot_import(
    snapshot_id: str = Path(..., min_length=8, max_length=64),
    importer: str = "anonymous",
) -> dict:
    """Log an import (Apply) of a public snapshot — drives the Featured banner.

    Idempotency: we don't dedupe per-importer here on purpose. Re-importing the
    same preset twice in two distinct sessions is a genuine signal of value;
    the rolling 7-day window naturally caps abuse.
    """
    importer = (importer or "anonymous").strip()
    if importer != "anonymous" and not _OWNER_RE.match(importer):
        raise HTTPException(400, "invalid importer key")

    snap = await _db().midi_snapshots.find_one({"id": snapshot_id})
    if not snap:
        raise HTTPException(404, "snapshot not found")
    if not snap.get("shared"):
        raise HTTPException(403, "snapshot is private — cannot import")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    # Log the import event (capped collection-style retention via window query).
    await _db().midi_snapshot_imports.insert_one({
        "snapshot_id": snapshot_id,
        "importer": importer,
        "owner": snap.get("owner"),
        "imported_at": now_iso,
    })
    # Denormalise counter + last_imported_at on the snapshot doc.
    await _db().midi_snapshots.update_one(
        {"id": snapshot_id},
        {
            "$inc": {"import_count": 1},
            "$set": {"last_imported_at": now_iso},
        },
    )
    doc = await _db().midi_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    return {
        "imported": True,
        "snapshot_id": snapshot_id,
        "import_count": doc.get("import_count", 1),
        "last_imported_at": doc.get("last_imported_at"),
    }


# Helpers exported for tests
__all__ = [
    "router",
    "DEFAULT_MAPPING",
    "_slice_style",
    "_cc_to_tempo",
    "_cc_to_pan",
]
