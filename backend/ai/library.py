"""
RIBA Bantu Storytelling Library — community sharing of Mvett arrangements.

The first numerical griot social-network endpoint. Every musician on the
planet can publish a Mvett arrangement they crafted (or any of the 4 chapter
plans coming from /api/ai/storytelling), browse the worldwide library, filter
by language or rhythmic style, and load any record straight into their own
RIBA workspace.

MongoDB collection : ``storytelling_library``
    id           (str)  : public uuid (handed out to the world)
    title        (str)  : the Mvett title
    theme        (str)  : the original prompt
    language     (str)  : fr|en|es|pt|sw
    bantu_style  (str)  : asiko_wisdom|makossa_roots|bikutsi_44|bikutsi_68|bikutsi_1224
    total_bars   (int)  : total number of bars
    chapters     (list) : 4 chapter dicts (intro/defi/combat/sagesse)
    lyrics       (list) : list of strings (proverbs/lyrics)
    author_name  (str)  : display name shown to the world
    author_token (str)  : secret token returned only at creation — used to delete
    plays        (int)  : incremented on each /library/{id} GET
    created_at   (str)  : ISO-8601 UTC
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, conint, conlist

router = APIRouter(prefix="/storytelling", tags=["storytelling-library"])
logger = logging.getLogger(__name__)

# Lazy Mongo handle — connection string is grabbed from the environment exactly
# once. Tests + production share the same MONGO_URL / DB_NAME contract.
_client: Optional[AsyncIOMotorClient] = None


def _db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client[os.environ["DB_NAME"]]


SUPPORTED_LANGS = {"fr", "en", "es", "pt", "sw"}
ALLOWED_BANTU = {
    "asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224",
}
EXPECTED_SLUGS = ["intro", "defi", "combat", "sagesse"]


class ChapterIn(BaseModel):
    slug: str
    marker_label: str = Field(..., min_length=1, max_length=80)
    bar_start: conint(ge=1, le=512)  # type: ignore[valid-type]
    bar_end:   conint(ge=1, le=512)  # type: ignore[valid-type]
    tempo_target: conint(ge=40, le=240)  # type: ignore[valid-type]
    swing_intensity: float = Field(..., ge=0.0, le=1.0)
    arrangement_hint: str
    narration: str = ""


class PublishRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    theme: str = Field(..., min_length=2, max_length=400)
    language: str = Field(..., min_length=2, max_length=4)
    bantu_style: str
    total_bars: conint(ge=8, le=256)  # type: ignore[valid-type]
    chapters: conlist(ChapterIn, min_length=4, max_length=4)  # type: ignore[valid-type]
    lyrics: conlist(str, min_length=2, max_length=64)  # type: ignore[valid-type]
    author_name: str = Field("Anonymous Griot", min_length=1, max_length=60)


def _sanitize_author(name: str) -> str:
    # Strip control chars / HTML-ish tokens — display only
    cleaned = re.sub(r"[<>{}\[\]]", "", name or "").strip()
    return cleaned[:60] or "Anonymous Griot"


def _serialize_public(doc: dict) -> dict:
    """Drop the secret token + Mongo _id before returning to a caller."""
    return {
        k: v for k, v in doc.items()
        if k not in ("_id", "author_token")
    }


@router.get("/library/stats")
async def library_stats():
    db = _db()
    total = await db.storytelling_library.count_documents({})
    by_lang_cursor = db.storytelling_library.aggregate([
        {"$group": {"_id": "$language", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ])
    by_style_cursor = db.storytelling_library.aggregate([
        {"$group": {"_id": "$bantu_style", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ])
    by_lang = {d["_id"]: d["count"] async for d in by_lang_cursor}
    by_style = {d["_id"]: d["count"] async for d in by_style_cursor}
    return {"total": total, "by_language": by_lang, "by_style": by_style}


@router.post("/library", status_code=201)
async def publish_story(req: PublishRequest, request: Request):
    lang = req.language.lower()[:2]
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(400, f"language must be one of {sorted(SUPPORTED_LANGS)}")
    if req.bantu_style not in ALLOWED_BANTU:
        raise HTTPException(400, f"bantu_style must be one of {sorted(ALLOWED_BANTU)}")
    # Chapter order + bars contiguity
    slugs = [c.slug for c in req.chapters]
    if slugs != EXPECTED_SLUGS:
        raise HTTPException(400, f"chapters must be ordered as {EXPECTED_SLUGS}, got {slugs}")
    for i, ch in enumerate(req.chapters):
        if ch.arrangement_hint not in {
            "solo_drum", "swing_accel", "swing_decel", "vocal_chant",
            "polyrhythm_drop", "tempo_climb", "tempo_release", "silence_break",
        }:
            raise HTTPException(400, f"chapter {i} has invalid arrangement_hint={ch.arrangement_hint!r}")
        if ch.bar_end < ch.bar_start:
            raise HTTPException(400, f"chapter {i}: bar_end < bar_start")
    if req.chapters[0].bar_start != 1:
        raise HTTPException(400, "chapter 0 must start at bar 1")
    if req.chapters[-1].bar_end != req.total_bars:
        raise HTTPException(400, f"chapter 3 must end at total_bars={req.total_bars}")
    for i in range(1, 4):
        if req.chapters[i].bar_start != req.chapters[i - 1].bar_end + 1:
            raise HTTPException(400, f"chapter {i} not contiguous to chapter {i - 1}")

    public_id = str(uuid.uuid4())
    author_token = secrets.token_urlsafe(24)
    doc = {
        "id": public_id,
        "title": req.title.strip(),
        "theme": req.theme.strip(),
        "language": lang,
        "bantu_style": req.bantu_style,
        "total_bars": req.total_bars,
        "chapters": [c.model_dump() for c in req.chapters],
        "lyrics": [s.strip()[:140] for s in req.lyrics if isinstance(s, str)],
        "author_name": _sanitize_author(req.author_name),
        "author_token": author_token,
        "plays": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db().storytelling_library.insert_one(doc)
    return {
        "id": public_id,
        "author_token": author_token,   # only returned at creation
        "created_at": doc["created_at"],
        "message": "Story published to the global Bantu library. Save the author_token "
                   "to delete it later — it is shown only this once.",
    }


@router.get("/library")
async def browse_library(
    lang: Optional[str] = Query(None, description="ISO code (fr|en|es|pt|sw)"),
    style: Optional[str] = Query(None, description="Bantu style filter"),
    q: Optional[str] = Query(None, description="Full-text search on title/theme/author"),
    sort: str = Query("recent", description="recent | popular | random"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10_000),
):
    db = _db()
    flt: dict = {}
    if lang:
        flt["language"] = lang.lower()[:2]
    if style:
        flt["bantu_style"] = style
    if q:
        # Case-insensitive substring search on three textual fields
        rx = re.compile(re.escape(q.strip()), re.IGNORECASE)
        flt["$or"] = [{"title": rx}, {"theme": rx}, {"author_name": rx}]

    total = await db.storytelling_library.count_documents(flt)
    sort_spec = {"recent": [("created_at", -1)], "popular": [("plays", -1), ("created_at", -1)]}.get(sort)
    cursor = db.storytelling_library.find(flt)
    if sort == "random" and total > 0:
        # MongoDB $sample needs aggregation — keep it cheap for small N
        pipeline: list = []
        if flt:
            pipeline.append({"$match": flt})
        pipeline.append({"$sample": {"size": limit}})
        cursor = db.storytelling_library.aggregate(pipeline)
    else:
        if sort_spec:
            cursor = cursor.sort(sort_spec)
        cursor = cursor.skip(offset).limit(limit)

    items = []
    async for doc in cursor:
        items.append(_serialize_public(doc))
    return {"total": total, "limit": limit, "offset": offset, "sort": sort, "items": items}


@router.get("/library/{story_id}")
async def fetch_story(story_id: str):
    db = _db()
    doc = await db.storytelling_library.find_one({"id": story_id})
    if not doc:
        raise HTTPException(404, "story not found")
    # Increment play count atomically (fire-and-forget effect on returned doc)
    await db.storytelling_library.update_one({"id": story_id}, {"$inc": {"plays": 1}})
    doc["plays"] = (doc.get("plays") or 0) + 1
    return _serialize_public(doc)


@router.delete("/library/{story_id}")
async def delete_story(
    story_id: str,
    x_author_token: Optional[str] = Header(default=None),
):
    if not x_author_token:
        raise HTTPException(401, "X-Author-Token header required")
    db = _db()
    doc = await db.storytelling_library.find_one({"id": story_id})
    if not doc:
        raise HTTPException(404, "story not found")
    if doc.get("author_token") != x_author_token:
        raise HTTPException(403, "invalid author token")
    await db.storytelling_library.delete_one({"id": story_id})
    return {"deleted": True, "id": story_id}
