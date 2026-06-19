"""
RIBA Promo Cascade — 7-day auto-pilot publication plan.

Generates the full 60s album teaser AND 3 micro-reels (15s each) cut at the
Peak / Drop / Hook moments of the same mixdown, then schedules a 4-step
campaign over 7 days through APScheduler.

Endpoint (under /api/ai):
    POST /promo-cascade
        body : {
          track_ids:     [str],
          mode:          "drop_map" | "sequential",
          bantu_style:   str,
          title:         str,
          style_label:   str,
          start_at:      ISO datetime (default = now)
          schedule:      [+0, +2, +4, +6] days offset (default)
          platforms:     ["tiktok","instagram","youtube"]
          autopublish:   bool (defaults to true)
        }
        returns {
          teaser:       { id, mp4_url, mp3_url, cover_url, duration },
          micro_reels:  [ { id, mp4_url, offset_sec, picked }... ],   # 3 items
          schedule:     [ { kind, schedule_at, platform, ... } ],
          jobs_queued:  N,
          status:       "scheduled" | "pack_only"  (pack_only when no platforms ready)
        }
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import tempfile

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .album import album_teaser, AlbumTeaserRequest, REELS_DIR
from .reel import FORMATS, _build_filter_complex, _ffmpeg_available, _run_ffmpeg
from .scheduler import schedule_publish_job
from .share import _platform_status
from .snippets import analyze_snippets

router = APIRouter(prefix="/ai", tags=["ai-promo-cascade"])
log = logging.getLogger("riba.promo")

DEFAULT_OFFSETS = [0, 2, 4, 6]  # days


class PromoCascadeRequest(BaseModel):
    track_ids:   list[str]
    mode:        str = "drop_map"
    bantu_style: str = "bikutsi_44"
    title:       str = "RIBA Album"
    style_label: str = "Bantu Drop Map"
    start_at:    str | None = None       # ISO datetime
    schedule:    list[int] = Field(default_factory=lambda: DEFAULT_OFFSETS.copy())
    platforms:   list[str] = Field(default_factory=lambda: ["tiktok", "instagram", "youtube"])
    description: str = ""
    hashtags:    list[str] = Field(default_factory=list)
    autopublish: bool = True
    micro_duration_sec: int = 15


async def _make_micro_reel(
    teaser_mp4: Path, start_sec: float, duration: int, label: str,
    title: str, style_label: str, cascade_id: str, suffix: str,
) -> dict:
    """Cut a {duration}s snippet from the album-teaser MP4 + re-encode with
    the same RIBA branding overlays, so each micro-reel keeps the same look."""
    w, h = FORMATS["square_1080"]
    out_mp4 = REELS_DIR / f"promo_{cascade_id}_{suffix}.mp4"
    fc = _build_filter_complex(w, h, f"{title} · {label}", style_label, "Made with RIBA · Promo Cascade")
    args = ["ffmpeg", "-y", "-ss", f"{start_sec:.3f}", "-i", str(teaser_mp4),
            "-filter_complex", fc, "-map", "[v]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-t", str(duration),
            "-movflags", "+faststart", str(out_mp4)]
    code, err = await _run_ffmpeg(args, timeout=120)
    if code != 0 or not out_mp4.exists():
        raise HTTPException(500, f"ffmpeg micro-reel '{label}' failed (code={code}): {err[-500:]}")
    return {
        "id":         f"{cascade_id}_{suffix}",
        "label":      label,
        "offset_sec": round(start_sec, 2),
        "duration":   duration,
        "mp4_url":    f"/api/ai/workspace/reel/{out_mp4.name}",
        "mp4_bytes":  out_mp4.stat().st_size,
    }


@router.post("/promo-cascade")
async def promo_cascade(req: PromoCascadeRequest):
    ok, _ = _ffmpeg_available()
    if not ok:
        raise HTTPException(503, "ffmpeg not available on this server")
    if not req.track_ids:
        raise HTTPException(400, "track_ids required.")
    if len(req.schedule) != 4:
        raise HTTPException(400, "schedule must contain exactly 4 day-offsets (e.g. [0, 2, 4, 6]).")
    for p in req.platforms:
        if p not in ("tiktok", "instagram", "youtube"):
            raise HTTPException(400, f"unknown platform: {p}")
    micro_dur = max(5, min(30, int(req.micro_duration_sec)))

    cascade_id = uuid.uuid4().hex[:16]

    # 1) Build the album teaser (60s by default).
    teaser_req = AlbumTeaserRequest(
        track_ids=req.track_ids, mode=req.mode, target_duration=60,
        transition_sec=1.5, bantu_style=req.bantu_style,
        title=req.title, style_label=req.style_label,
    )
    teaser = await album_teaser(teaser_req)
    teaser_path = REELS_DIR / f"album_{teaser['id']}.mp4"
    if not teaser_path.exists():
        raise HTTPException(500, "teaser mp4 missing on disk after album build")

    # 2) Analyse the teaser mixdown for Peak / Drop / Hook offsets.
    #    soundfile cannot read MP4 directly → extract audio to a temp WAV first.
    tmp_dir = Path(tempfile.mkdtemp(prefix="riba-promo-"))
    tmp_wav = tmp_dir / f"teaser_audio_{cascade_id}.wav"
    try:
        ex_args = ["ffmpeg", "-y", "-i", str(teaser_path),
                   "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(tmp_wav)]
        code, err = await _run_ffmpeg(ex_args, timeout=60)
        if code != 0 or not tmp_wav.exists():
            raise HTTPException(500, f"failed to extract teaser audio (code={code}): {err[-300:]}")
        try:
            snippet = await asyncio.to_thread(analyze_snippets, tmp_wav, micro_dur)
        except Exception as exc:
            raise HTTPException(500, f"snippet analysis failed on teaser: {exc}") from exc
    finally:
        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass
    by_name = {c["name"]: c for c in snippet["candidates"]}

    # Use the REAL teaser duration measured by the snippet analyser (might be
    # shorter than the requested 60s when input loops are themselves short).
    real_teaser_dur = float(snippet.get("duration") or teaser["duration"])
    max_start = max(0.0, real_teaser_dur - micro_dur)
    micro_specs = [
        ("Peak",  "peak",  by_name.get("peak_energy", {"start_sec": 0.0})),
        ("Drop",  "drop",  by_name.get("bantu_drop",  {"start_sec": min(20.0, max_start)})),
        ("Hook",  "hook",  by_name.get("main_hook",   {"start_sec": min(40.0, max_start)})),
    ]
    micro_reels: list[dict] = []
    for label, suffix, spec in micro_specs:
        start = max(0.0, min(float(spec["start_sec"]), max_start))
        info = await _make_micro_reel(
            teaser_mp4=teaser_path, start_sec=start, duration=micro_dur,
            label=label, title=req.title, style_label=req.style_label,
            cascade_id=cascade_id, suffix=suffix,
        )
        info["picked_from"] = spec.get("name") or suffix
        info["score_norm"] = spec.get("score_norm")
        micro_reels.append(info)

    # 3) Build the schedule plan
    start_at = (
        datetime.fromisoformat(req.start_at.replace("Z", "+00:00"))
        if req.start_at else datetime.now(timezone.utc)
    )
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)
    artefacts = [
        {"kind": "teaser_60s", "reel_id": teaser["id"],            "label": "Album Teaser",  "offset_idx": 0},
        {"kind": "micro_peak", "reel_id": micro_reels[0]["id"],     "label": "Peak focus",    "offset_idx": 1},
        {"kind": "micro_drop", "reel_id": micro_reels[1]["id"],     "label": "Drop focus",    "offset_idx": 2},
        {"kind": "micro_hook", "reel_id": micro_reels[2]["id"],     "label": "Hook focus",    "offset_idx": 3},
    ]

    plan: list[dict] = []
    queued = 0
    ready_platforms = [p for p in req.platforms if _platform_status(p)["configured"]]
    for art in artefacts:
        when = (start_at + timedelta(days=req.schedule[art["offset_idx"]])).isoformat()
        for plat in req.platforms:
            entry: dict[str, Any] = {
                "kind":        art["kind"],
                "reel_id":     art["reel_id"],
                "label":       art["label"],
                "platform":    plat,
                "schedule_at": when,
                "queued":      False,
            }
            if req.autopublish and plat in ready_platforms:
                payload = {
                    "reel_id":     art["reel_id"],
                    "description": req.description or f"{req.title} — {art['label']}",
                    "hashtags":    req.hashtags,
                    "title":       f"{req.title} — {art['label']}",
                    "schedule_at": when,
                    "privacy":     "public",
                }
                rec = schedule_publish_job(plat, payload, when)
                entry.update({"queued": True, "persisted_id": rec.get("queued_at")})
                queued += 1
            plan.append(entry)

    return {
        "cascade_id": cascade_id,
        "teaser": {
            "id":       teaser["id"],
            "mp4_url":  teaser["mp4_url"],
            "mp3_url":  teaser["mp3_url"],
            "cover_url": teaser["cover_url"],
            "duration": teaser["duration"],
            "tracks":   teaser["tracks"],
        },
        "micro_reels": micro_reels,
        "schedule":    plan,
        "jobs_queued": queued,
        "platforms_ready": ready_platforms,
        "status":      "scheduled" if queued > 0 else "pack_only",
        "start_at":    start_at.isoformat(),
        "schedule_offsets_days": req.schedule,
    }
