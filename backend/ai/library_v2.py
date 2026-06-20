"""
RIBA Library v2 — engagement layer on top of the Storytelling Library.

- Likes (anonymous, per `client_id` token, idempotent toggle).
- Comments (moderation-ready, deletable by comment author OR curator).
- Griot profile aggregation (records published, total plays/likes, badges, top style).
- World heatmap of publications (language → diaspora region mapping).

All endpoints live under the same /storytelling prefix as the parent library
router so callers see a single coherent surface.
"""
from __future__ import annotations

import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from .library import _db, _serialize_public, SUPPORTED_LANGS  # reuse helpers

router = APIRouter(prefix="/storytelling", tags=["storytelling-library-v2"])


# === World heatmap mapping ====================================================
# language code → (region label, approx lat/long anchor, RGB punch color)
LANG_REGIONS = {
    "fr": {"region": "Africa-Centrale · Yaoundé",   "lat": 3.85,   "lng": 11.50,
            "color": [217, 70, 239]},   # magenta
    "en": {"region": "Anglosphere · Brooklyn",       "lat": 40.65,  "lng": -73.95,
            "color": [34, 211, 238]},   # cyan
    "es": {"region": "Hispanophone · Madrid",        "lat": 40.40,  "lng": -3.70,
            "color": [245, 158, 11]},   # amber
    "pt": {"region": "Lusophone · São Paulo",        "lat": -23.55, "lng": -46.63,
            "color": [99, 102, 241]},    # indigo-violet
    "sw": {"region": "Africa-Est · Nairobi",         "lat": -1.29,  "lng": 36.82,
            "color": [34, 197, 94]},    # green
}


# === Pydantic schemas =========================================================

class CommentIn(BaseModel):
    author_name: str = Field("Anonymous", min_length=1, max_length=60)
    content: str     = Field(..., min_length=1, max_length=600)


# === Helpers ==================================================================

def _sanitize_text(t: str, cap: int = 600) -> str:
    cleaned = re.sub(r"[<>{}\[\]]", "", t or "").strip()
    return cleaned[:cap]


def _client_token(header_value: Optional[str]) -> str:
    """Coerce the client-id header into a safe key (alphanum only, max 64 chars)."""
    if not header_value:
        raise HTTPException(400, "X-Client-Id header required for like/comment actions")
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", header_value)[:64]
    if not cleaned:
        raise HTTPException(400, "X-Client-Id must contain at least one safe character")
    return cleaned


# === Likes ====================================================================

@router.post("/library/{story_id}/like")
async def toggle_like(
    story_id: str,
    x_client_id: Optional[str] = Header(default=None),
):
    """Idempotent toggle — calling twice from the same client_id un-likes.

    Like count is stored on the document itself plus an array `like_clients`
    capped at 50 000 entries (then we transparently truncate the oldest).
    """
    cid = _client_token(x_client_id)
    db = _db()
    doc = await db.storytelling_library.find_one({"id": story_id})
    if not doc:
        raise HTTPException(404, "story not found")
    likers = list(doc.get("like_clients") or [])
    if cid in likers:
        likers.remove(cid)
        liked = False
    else:
        likers.append(cid)
        if len(likers) > 50_000:
            likers = likers[-50_000:]
        liked = True
    await db.storytelling_library.update_one(
        {"id": story_id},
        {"$set": {"like_clients": likers, "likes": len(likers)}},
    )
    return {"id": story_id, "liked": liked, "likes": len(likers)}


@router.get("/library/{story_id}/like-status")
async def like_status(
    story_id: str,
    x_client_id: Optional[str] = Header(default=None),
):
    cid = _client_token(x_client_id)
    doc = await _db().storytelling_library.find_one({"id": story_id})
    if not doc:
        raise HTTPException(404, "story not found")
    likers = doc.get("like_clients") or []
    return {"id": story_id, "liked": cid in likers, "likes": len(likers)}


# === Comments =================================================================

@router.get("/library/{story_id}/comments")
async def list_comments(
    story_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
):
    db = _db()
    if not await db.storytelling_library.find_one({"id": story_id}, projection={"_id": 1}):
        raise HTTPException(404, "story not found")
    moderate = os.environ.get("RIBA_MODERATE_COMMENTS", "").lower() in ("1", "true", "yes")
    flt: dict = {"story_id": story_id}
    if moderate:
        flt["approved"] = True
    cursor = db.storytelling_comments.find(flt).sort("created_at", -1).skip(offset).limit(limit)
    items = []
    async for c in cursor:
        items.append({
            "id":          c["id"],
            "story_id":    c["story_id"],
            "author_name": c.get("author_name", "Anonymous"),
            "content":     c.get("content", ""),
            "created_at":  c["created_at"],
            "approved":    c.get("approved", True),
        })
    total = await db.storytelling_comments.count_documents(flt)
    return {"total": total, "items": items, "moderation": moderate}


@router.post("/library/{story_id}/comments", status_code=201)
async def post_comment(
    story_id: str,
    req: CommentIn,
    x_client_id: Optional[str] = Header(default=None),
):
    cid = _client_token(x_client_id)
    db = _db()
    if not await db.storytelling_library.find_one({"id": story_id}, projection={"_id": 1}):
        raise HTTPException(404, "story not found")
    moderate = os.environ.get("RIBA_MODERATE_COMMENTS", "").lower() in ("1", "true", "yes")
    comment_id = str(uuid.uuid4())
    author_token = secrets.token_urlsafe(16)
    doc = {
        "id": comment_id,
        "story_id": story_id,
        "author_name": _sanitize_text(req.author_name, 60) or "Anonymous",
        "content": _sanitize_text(req.content, 600),
        "client_id": cid,
        "author_token": author_token,
        "approved": not moderate,   # auto-approve unless moderation enabled
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.storytelling_comments.insert_one(doc)
    return {
        "id": comment_id,
        "author_token": author_token,   # one-shot for self-deletion
        "approved": doc["approved"],
        "moderation_pending": not doc["approved"],
        "created_at": doc["created_at"],
    }


@router.delete("/library/{story_id}/comments/{comment_id}")
async def delete_comment(
    story_id: str,
    comment_id: str,
    x_author_token: Optional[str] = Header(default=None),
    x_curator_token: Optional[str] = Header(default=None),
):
    db = _db()
    doc = await db.storytelling_comments.find_one({"id": comment_id, "story_id": story_id})
    if not doc:
        raise HTTPException(404, "comment not found")
    is_curator = (
        x_curator_token is not None
        and x_curator_token == os.environ.get("RIBA_CURATOR_TOKEN")
        and os.environ.get("RIBA_CURATOR_TOKEN")
    )
    if not is_curator:
        if not x_author_token or x_author_token != doc.get("author_token"):
            raise HTTPException(403, "invalid author/curator token")
    await db.storytelling_comments.delete_one({"id": comment_id})
    return {"deleted": True, "id": comment_id, "by_curator": is_curator}


# === Griot profile ============================================================

def _badges_for(records: list) -> list:
    """Light gamification — purely a function of public stats, no PII."""
    badges = []
    n = len(records)
    if n >= 1:  badges.append("first_record")
    if n >= 5:  badges.append("storyteller")
    if n >= 25: badges.append("master_griot")
    total_plays = sum(r.get("plays", 0) for r in records)
    if total_plays >= 100:  badges.append("voice_of_the_diaspora")
    if total_plays >= 1000: badges.append("hall_of_phoenix")
    total_likes = sum(r.get("likes", 0) for r in records)
    if total_likes >= 50: badges.append("beloved")
    langs = {r.get("language") for r in records}
    if len(langs) >= 3: badges.append("polyglot")
    if any(r.get("is_featured") for r in records): badges.append("curator_pick")
    return badges


@router.get("/griot/{author_name}")
async def griot_profile(author_name: str):
    """Public profile aggregating one author's full output across the Library.

    Matched on EXACT `author_name` (case-sensitive). Returns stats + recent
    publications + accumulated badges. Never leaks `author_token`.
    """
    if not author_name or len(author_name) > 60:
        raise HTTPException(400, "invalid author_name")
    db = _db()
    records = []
    async for d in db.storytelling_library.find({"author_name": author_name}).sort("created_at", -1):
        records.append(_serialize_public(d))
    if not records:
        raise HTTPException(404, "griot not found")
    total_plays = sum(r.get("plays", 0) for r in records)
    total_likes = sum(r.get("likes", 0) for r in records)
    # Style preference
    style_counts: dict = {}
    for r in records:
        style_counts[r["bantu_style"]] = style_counts.get(r["bantu_style"], 0) + 1
    top_style = max(style_counts.items(), key=lambda kv: kv[1])[0] if style_counts else None
    langs = sorted({r["language"] for r in records})
    return {
        "author_name": author_name,
        "stats": {
            "records":     len(records),
            "total_plays": total_plays,
            "total_likes": total_likes,
            "languages":   langs,
            "top_style":   top_style,
        },
        "badges": _badges_for(records),
        "records": records[:30],   # most-recent 30
    }


# === World Heatmap ============================================================

@router.get("/library/heatmap")
async def world_heatmap():
    """Aggregate publications by language → diaspora region.

    Returns one row per region with `count`, `total_plays`, `total_likes`,
    geographic anchor and palette color. Pure read-only call.
    """
    db = _db()
    cursor = db.storytelling_library.aggregate([
        {"$group": {
            "_id": "$language",
            "count": {"$sum": 1},
            "plays": {"$sum": "$plays"},
            "likes": {"$sum": "$likes"},
        }},
    ])
    rows = []
    async for d in cursor:
        lang = (d.get("_id") or "").lower()
        meta = LANG_REGIONS.get(lang)
        if not meta:
            continue
        rows.append({
            "lang":   lang,
            "region": meta["region"],
            "lat":    meta["lat"],
            "lng":    meta["lng"],
            "color":  meta["color"],
            "count":  d["count"],
            "plays":  d.get("plays", 0),
            "likes":  d.get("likes", 0),
        })
    rows.sort(key=lambda r: r["count"], reverse=True)
    total_records = sum(r["count"] for r in rows)
    return {
        "month":  datetime.now(timezone.utc).strftime("%Y-%m"),
        "regions": rows,
        "total_records": total_records,
        "supported_languages": sorted(SUPPORTED_LANGS),
    }
