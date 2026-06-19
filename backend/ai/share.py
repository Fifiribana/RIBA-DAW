"""
RIBA Auto-share — programmatic publishing of Bantu Reels to TikTok, Instagram
Reels and YouTube Shorts.

The module is split in 3 layers :

1. **Prep layer** (always live, no creds needed) — generates the optimal
   description, hashtags and per-platform caption variants from the reel's
   metadata (title, style, watermark…).

2. **Status layer** — reports which platforms have creds configured in the
   environment so the UI can show clear setup hints.

3. **Publish layer** — calls the real platform APIs **only** when credentials
   are present. Otherwise returns a structured 503 with the exact env vars the
   user must set. Scheduling is stored in MongoDB so an external cron can run
   later.

Endpoints (under /api/ai):
    GET  /share/status                       → per-platform readiness
    POST /share/prepare                      → description / hashtags packs
    POST /share/{platform}/publish           → tiktok | instagram | youtube
    GET  /share/jobs                         → list past + scheduled jobs

ENV VARS expected (only those of the platforms you care about):
    TIKTOK_ACCESS_TOKEN
    IG_USER_ID, IG_ACCESS_TOKEN, PUBLIC_BASE_URL
    YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ai", tags=["ai-share"])
log = logging.getLogger("riba.share")

REELS_DIR = Path(__file__).resolve().parents[1] / "static" / "workspace" / "reels"

# In-memory job log (production: swap for Mongo collection)
_JOBS: list[dict] = []


# =========================================================================
# Style → hashtag mapping (kept lightweight; the UI can override)
# =========================================================================
STYLE_HASHTAGS: dict[str, list[str]] = {
    "bikutsi_44":    ["#Bikutsi", "#BikutsiGroove", "#Cameroon"],
    "bikutsi_68":    ["#Bikutsi", "#Bikutsi68", "#PolyrhythmAfrica"],
    "bikutsi_1224":  ["#Bikutsi", "#Polyrhythm", "#Bantu"],
    "makossa_roots": ["#Makossa", "#MakossaRoots", "#CamerounMusic"],
    "asiko_wisdom":  ["#Asiko", "#AsikoMusic", "#WestAfrica"],
    "afrobeat":      ["#Afrobeat", "#AfrobeatGroove"],
    "rumba":         ["#Rumba", "#RumbaCongo", "#CongoMusic"],
    "soukous":       ["#Soukous", "#CongolaiseMusic"],
    "highlife":      ["#Highlife", "#WestAfricanMusic"],
    "zouk":          ["#Zouk", "#ZoukAntilles"],
    "ekang":         ["#Ekang"],
}
BRAND_HASHTAGS = ["#RIBA", "#BantuOralGrid", "#MadeWithRIBA"]
SHORTS_HASHTAG = "#Shorts"

# Character / length limits per platform (publishing constraints)
LIMITS = {
    "tiktok":    {"caption_max": 2200, "max_hashtags": 30, "max_duration_sec": 180},
    "instagram": {"caption_max": 2200, "max_hashtags": 30, "max_duration_sec": 90},
    "youtube":   {"title_max":   100,  "description_max": 5000, "tags_max": 500, "max_duration_sec": 60},
}


# =========================================================================
# 1) STATUS / READINESS
# =========================================================================
def _has(v: str | None) -> bool:
    return bool(v and v.strip() and not v.strip().startswith("your_"))


def _platform_status(platform: str) -> dict:
    e = os.environ
    if platform == "tiktok":
        token = e.get("TIKTOK_ACCESS_TOKEN", "")
        return {
            "configured": _has(token),
            "missing":    [k for k in ("TIKTOK_ACCESS_TOKEN",) if not _has(e.get(k, ""))],
            "schedule_native": False,
        }
    if platform == "instagram":
        ig_user = e.get("IG_USER_ID", ""); ig_tok = e.get("IG_ACCESS_TOKEN", "")
        public  = e.get("PUBLIC_BASE_URL", "")
        return {
            "configured": _has(ig_user) and _has(ig_tok) and _has(public),
            "missing":    [k for k in ("IG_USER_ID", "IG_ACCESS_TOKEN", "PUBLIC_BASE_URL") if not _has(e.get(k, ""))],
            "schedule_native": False,
            "needs_public_url": True,
        }
    if platform == "youtube":
        cid = e.get("YOUTUBE_CLIENT_ID", ""); cs = e.get("YOUTUBE_CLIENT_SECRET", "")
        rt  = e.get("YOUTUBE_REFRESH_TOKEN", "")
        return {
            "configured": _has(cid) and _has(cs) and _has(rt),
            "missing":    [k for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN") if not _has(e.get(k, ""))],
            "schedule_native": True,
        }
    raise HTTPException(400, f"Unknown platform: {platform}")


@router.get("/share/status")
def share_status():
    return {
        "platforms": {p: _platform_status(p) for p in ("tiktok", "instagram", "youtube")},
        "brand_hashtags":   BRAND_HASHTAGS,
        "shorts_hashtag":   SHORTS_HASHTAG,
        "available_styles": sorted(STYLE_HASHTAGS.keys()),
        "limits":           LIMITS,
    }


# =========================================================================
# 2) PREPARE — auto description + hashtags + per-platform packs
# =========================================================================
class PrepareRequest(BaseModel):
    title: str
    style: str | None = None              # e.g. "bikutsi_44" or free text "Afrobeat"
    description: str | None = None        # user-typed description (optional)
    extra_hashtags: list[str] = Field(default_factory=list)
    mention_riba: bool = True             # add #RIBA brand stack
    target_duration_sec: int | None = None


def _normalize_style(s: str | None) -> str | None:
    if not s:
        return None
    k = s.strip().lower().replace(" ", "_").replace("/", "_")
    # generous matches: "Bikutsi 4/4" → "bikutsi_4_4" → still pull bikutsi_44
    k = re.sub(r"[^a-z0-9_]", "", k)
    if k in STYLE_HASHTAGS:
        return k
    # try prefix match on family (bikutsi_*)
    for key in STYLE_HASHTAGS:
        if k.startswith(key.split("_", 1)[0]):
            return key
    return None


def _auto_hashtags(style: str | None, extras: list[str], mention_riba: bool) -> list[str]:
    tags: list[str] = []
    norm = _normalize_style(style)
    if norm:
        tags.extend(STYLE_HASHTAGS[norm])
    if mention_riba:
        tags.extend(BRAND_HASHTAGS)
    # User extras — normalize each to #tag
    for t in extras:
        t = (t or "").strip()
        if not t:
            continue
        if not t.startswith("#"):
            t = "#" + t
        # remove spaces/special chars
        t = re.sub(r"[^A-Za-z0-9_#]", "", t)
        if t and t not in tags:
            tags.append(t)
    # dedup preserving order
    seen = set(); out = []
    for t in tags:
        if t.lower() in seen: continue
        seen.add(t.lower()); out.append(t)
    return out


@router.post("/share/prepare")
def share_prepare(req: PrepareRequest):
    title = (req.title or "RIBA Bantu Reel").strip()
    base_desc = (req.description or "").strip()
    tags = _auto_hashtags(req.style, req.extra_hashtags, req.mention_riba)

    # Build platform packs respecting each platform's caption shape.
    def _cap(lim: int, text: str) -> str:
        return text if len(text) <= lim else (text[: lim - 1] + "…")

    body = base_desc or f"Fresh groove cooked in RIBA — {title}. Bantu Oral Grid live, polyrhythmic textures by AI."

    # TikTok — hashtags often inline at the end of the description
    tt_tags = tags[: LIMITS["tiktok"]["max_hashtags"]]
    tiktok_caption = _cap(LIMITS["tiktok"]["caption_max"], f"{body}\n\n{' '.join(tt_tags)}")

    # Instagram — caption + hashtags, same shape
    ig_tags = tags[: LIMITS["instagram"]["max_hashtags"]]
    ig_caption = _cap(LIMITS["instagram"]["caption_max"], f"{body}\n\n{' '.join(ig_tags)}")

    # YouTube Shorts — title + description + tags list (no '#' in tags)
    yt_title_raw = title
    if "#Shorts" not in yt_title_raw and SHORTS_HASHTAG not in yt_title_raw:
        yt_title_raw = f"{yt_title_raw} {SHORTS_HASHTAG}"
    yt_title = _cap(LIMITS["youtube"]["title_max"], yt_title_raw)
    yt_desc  = _cap(LIMITS["youtube"]["description_max"], f"{body}\n\n{' '.join(tags)}")
    # plain tags list (no #)
    yt_tags = [t.lstrip("#") for t in tags][:30]

    return {
        "title":        title,
        "style":        req.style,
        "style_canonical": _normalize_style(req.style),
        "hashtags":     tags,
        "platforms": {
            "tiktok":    {"caption": tiktok_caption, "hashtags": tt_tags},
            "instagram": {"caption": ig_caption,     "hashtags": ig_tags},
            "youtube":   {"title": yt_title, "description": yt_desc, "tags": yt_tags},
        },
        "limits": LIMITS,
    }


# =========================================================================
# 3) PUBLISH — real API calls (only fire when creds configured)
# =========================================================================
class PublishRequest(BaseModel):
    reel_id:      str
    description:  str = ""
    hashtags:     list[str] = Field(default_factory=list)
    title:        str | None = None
    schedule_at:  str | None = None   # ISO-8601 UTC — supported natively only by YouTube
    privacy:      str = "public"       # "public" | "private" | "unlisted"


def _reel_mp4(reel_id: str) -> Path:
    # IDs are hex uuids OR boot_xxxx — only allow [a-z0-9_-]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", reel_id):
        raise HTTPException(400, "Invalid reel_id")
    candidates = [REELS_DIR / f"{reel_id}.mp4", REELS_DIR / f"boot_{reel_id}.mp4"]
    for c in candidates:
        if c.exists():
            return c
    raise HTTPException(404, "Reel MP4 not found. Generate it first via /api/ai/bantu-reel.")


def _missing_creds(platform: str) -> None:
    st = _platform_status(platform)
    if not st["configured"]:
        raise HTTPException(503, detail={
            "code":     f"{platform.upper()}_CREDS_MISSING",
            "platform": platform,
            "missing":  st["missing"],
            "message":  f"Configure {' / '.join(st['missing'])} in /app/backend/.env then restart backend.",
        })


def _push_job(platform: str, reel_id: str, status: str, **extra) -> dict:
    job = {
        "id":          str(uuid.uuid4()),
        "platform":    platform,
        "reel_id":     reel_id,
        "status":      status,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    _JOBS.insert(0, job)
    del _JOBS[200:]
    return job


# ----------------- TikTok -----------------
async def _publish_tiktok(reel: Path, req: PublishRequest) -> dict:
    token = os.environ["TIKTOK_ACCESS_TOKEN"].strip()
    caption = (req.description + ("\n\n" + " ".join(req.hashtags) if req.hashtags else "")).strip()
    fsize = reel.stat().st_size
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=120) as client:
        init = await client.post(
            "https://open.tiktokapis.com/v2/post/publish/video/init/",
            headers=headers,
            json={
                "post_info": {"title": caption[:2200], "privacy_level": "PUBLIC_TO_EVERYONE" if req.privacy == "public" else "MUTUAL_FOLLOW_FRIEND"},
                "source_info": {"source": "FILE_UPLOAD", "video_size": fsize, "chunk_size": fsize, "total_chunk_count": 1},
            },
        )
        if init.status_code >= 400:
            raise HTTPException(502, f"TikTok init failed: {init.text}")
        d = init.json().get("data") or {}
        upload_url = d.get("upload_url")
        publish_id = d.get("publish_id")
        if not upload_url:
            raise HTTPException(502, f"TikTok response missing upload_url: {init.text}")
        with reel.open("rb") as f:
            put = await client.put(
                upload_url,
                headers={"Content-Range": f"bytes 0-{fsize-1}/{fsize}", "Content-Type": "video/mp4"},
                content=f.read(),
            )
        if put.status_code >= 400:
            raise HTTPException(502, f"TikTok upload PUT failed: {put.text}")
    return {"publish_id": publish_id, "caption": caption}


# ----------------- Instagram Reels -----------------
async def _publish_instagram(reel: Path, req: PublishRequest) -> dict:
    ig_user = os.environ["IG_USER_ID"].strip()
    token   = os.environ["IG_ACCESS_TOKEN"].strip()
    public  = os.environ["PUBLIC_BASE_URL"].strip().rstrip("/")
    # Resolve a public URL : we expose REELS_DIR via /api/ai/workspace/reel/{id}.mp4
    video_url = f"{public}/api/ai/workspace/reel/{reel.name}"
    caption = (req.description + ("\n\n" + " ".join(req.hashtags) if req.hashtags else "")).strip()[:2200]
    async with httpx.AsyncClient(timeout=180) as client:
        c = await client.post(
            f"https://graph.facebook.com/v19.0/{ig_user}/media",
            data={"media_type": "REELS", "video_url": video_url, "caption": caption, "access_token": token},
        )
        if c.status_code >= 400:
            raise HTTPException(502, f"IG container failed: {c.text}")
        cid = c.json().get("id")
        if not cid:
            raise HTTPException(502, f"IG response missing creation id: {c.text}")
        # Poll status until FINISHED (Meta needs to download + transcode)
        for _ in range(20):
            await asyncio.sleep(3)
            s = await client.get(f"https://graph.facebook.com/v19.0/{cid}", params={"fields": "status_code", "access_token": token})
            if s.json().get("status_code") == "FINISHED":
                break
        # Publish
        p = await client.post(
            f"https://graph.facebook.com/v19.0/{ig_user}/media_publish",
            data={"creation_id": cid, "access_token": token},
        )
        if p.status_code >= 400:
            raise HTTPException(502, f"IG publish failed: {p.text}")
    return {"container_id": cid, "result": p.json(), "video_url": video_url}


# ----------------- YouTube Shorts -----------------
def _publish_youtube(reel: Path, req: PublishRequest) -> dict:
    from google.oauth2.credentials import Credentials  # type: ignore
    from googleapiclient.discovery import build         # type: ignore
    from googleapiclient.http import MediaFileUpload    # type: ignore

    creds = Credentials(
        token=None,
        refresh_token=os.environ["YOUTUBE_REFRESH_TOKEN"].strip(),
        client_id=os.environ["YOUTUBE_CLIENT_ID"].strip(),
        client_secret=os.environ["YOUTUBE_CLIENT_SECRET"].strip(),
        token_uri="https://oauth2.googleapis.com/token",
    )
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    yt_title = (req.title or "RIBA Bantu Reel #Shorts")[:100]
    desc = (req.description + ("\n\n" + " ".join(req.hashtags) if req.hashtags else "")).strip()[:5000]
    tags = [t.lstrip("#") for t in req.hashtags][:30]

    status_block: dict[str, Any] = {"privacyStatus": req.privacy if req.privacy in ("public", "private", "unlisted") else "public", "selfDeclaredMadeForKids": False}
    if req.schedule_at:
        status_block["privacyStatus"] = "private"
        status_block["publishAt"] = req.schedule_at

    body = {"snippet": {"title": yt_title, "description": desc, "tags": tags, "categoryId": "10"}, "status": status_block}
    media = MediaFileUpload(str(reel), mimetype="video/mp4", resumable=True)
    request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = request.execute()
    return {"youtube_video_id": resp.get("id"), "result": resp}


@router.post("/share/{platform}/publish")
async def share_publish(platform: str, req: PublishRequest):
    if platform not in ("tiktok", "instagram", "youtube"):
        raise HTTPException(400, f"Unknown platform: {platform}")
    _missing_creds(platform)
    reel = _reel_mp4(req.reel_id)

    # Schedule guard for platforms without native scheduling — persist via APScheduler.
    if req.schedule_at and platform in ("tiktok", "instagram"):
        from .scheduler import schedule_publish_job
        rec = schedule_publish_job(platform, req.model_dump(), req.schedule_at)
        job = _push_job(platform, req.reel_id, "scheduled",
                        schedule_at=req.schedule_at, description=req.description,
                        hashtags=req.hashtags, note="APScheduler will publish at the due time.")
        return {"scheduled": True, "platform": platform, "job": job, "persisted": rec}

    try:
        if platform == "tiktok":
            data = await _publish_tiktok(reel, req)
        elif platform == "instagram":
            data = await _publish_instagram(reel, req)
        else:
            data = await asyncio.to_thread(_publish_youtube, reel, req)
        job = _push_job(platform, req.reel_id, "published", **{k: v for k, v in data.items() if k != "result"})
        return {"published": True, "platform": platform, "job": job, "data": data}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("publish %s failed", platform)
        job = _push_job(platform, req.reel_id, "failed", error=str(exc))
        raise HTTPException(502, f"{platform} publish failed: {exc}") from exc


@router.get("/share/jobs")
def share_jobs():
    """In-memory recent jobs (resets on restart) — quick UI dashboard."""
    return {"jobs": _JOBS}


@router.get("/share/scheduled")
def share_scheduled():
    """Persisted scheduled jobs handled by APScheduler — survives restarts."""
    from .scheduler import list_scheduled_jobs
    return {"jobs": list_scheduled_jobs()}
