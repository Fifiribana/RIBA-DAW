"""
RIBA Album Builder + Bantu Drop Map.

Concatenates N workspace tracks into a single 60-second teaser video where
each segment is the most-viral excerpt of its source (computed by the Reel
Snippet Picker), stitched together with a Bantu-Grid-aligned crossfade so the
transitions keep the same swing.

Endpoints (under /api/ai):
    POST /album/teaser   → multi-track Bantu Drop Map teaser
        body: {
          track_ids:        [str],   # ordered workspace item IDs
          mode:             "drop_map" | "sequential",
          target_duration:  int 30..120 (default 60),
          transition_sec:   float 0.5..3.0 (default 1.5),
          bantu_style:      "bikutsi_44" | …,
          title:            str,
          style_label:      str,
        }
        returns: { id, mp4_url, mp3_url, cover_url, segments[], duration, mode }
    GET  /album/cover/{id}.png   → mosaic cover collage
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
import subprocess
import uuid
from pathlib import Path
from shutil import which
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFilter, ImageFont  # type: ignore
from pydantic import BaseModel, Field

from .generator import _load_index, LIBRARY, UPLOADS, WORKSPACE
from .reel import (
    FONT_BOLD, FONT_MONO, FONT_MONO_R, FORMATS,
    _build_filter_complex, _ffmpeg_available, _run_ffmpeg,
)
from .remix import _build_bantu_grid
from .snippets import analyze_snippets

router = APIRouter(prefix="/ai", tags=["ai-album"])
log = logging.getLogger("riba.album")

REELS_DIR = Path(__file__).resolve().parents[1] / "static" / "workspace" / "reels"
COVERS_DIR = REELS_DIR / "covers"
COVERS_DIR.mkdir(parents=True, exist_ok=True)


# =========================================================================
# Audio file resolution — reuses the workspace + uploads + library indices.
# =========================================================================
def _resolve_track(item_id: str) -> tuple[Path, dict] | None:
    """Return (audio_path, workspace_entry) for a workspace ID, or None.
    Looks up the standard workspace index AND the curated library manifest so
    library-only tracks (LIB-*) carry their proper title + tags into the mosaic."""
    import json as _json
    items = {it.get("id"): it for it in _load_index()}
    meta = items.get(item_id)
    # Also consult the library manifest for LIB-* entries
    if meta is None:
        lib_manifest = LIBRARY / "library.json"
        if lib_manifest.exists():
            try:
                for it in _json.loads(lib_manifest.read_text()):
                    if it.get("id") == item_id:
                        meta = it
                        break
            except Exception:
                pass
    candidates: list[Path] = [
        WORKSPACE / f"{item_id}.wav",
        UPLOADS / f"{item_id}.wav",
        UPLOADS / f"{item_id}.mp3",
        UPLOADS / f"{item_id}.ogg",
        UPLOADS / f"{item_id}.m4a",
        UPLOADS / f"{item_id}.webm",
        UPLOADS / f"{item_id}.flac",
        LIBRARY / f"{item_id}.wav",
    ]
    for p in candidates:
        if p.exists():
            return p, (meta or {"id": item_id, "title": item_id, "tags": []})
    return None


# =========================================================================
# Mosaic cover — deterministic HSL gradient tile per track (mirror of the
# frontend ProceduralCover algorithm) composed in a 2×2 / 3×3 / 4×4 grid.
# =========================================================================
def _hash_int(s: str) -> int:
    h = 0
    for c in s:
        h = ((h << 5) - h + ord(c)) & 0xFFFFFFFF
    return h


def _hsl_to_rgb(h: float, s: float, lum: float) -> tuple[int, int, int]:
    """h in [0,360], s & lum in [0,1]"""
    c = (1 - abs(2 * lum - 1)) * s
    x = c * (1 - abs(((h / 60) % 2) - 1))
    m = lum - c / 2
    if   h < 60:  r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else:         r, g, b = c, 0, x
    return (int((r + m) * 255), int((g + m) * 255), int((b + m) * 255))


def _track_tile(seed: str, tag: str, size: int) -> Image.Image:
    h = abs(_hash_int(seed or "riba"))
    h1, h2 = h % 360, (h >> 4) % 360
    img = Image.new("RGB", (size, size), _hsl_to_rgb(h1, 0.8, 0.30))
    d = ImageDraw.Draw(img, "RGBA")
    # Diagonal gradient overlay using a polygon at 50% alpha
    c2 = _hsl_to_rgb(h2, 0.9, 0.18)
    d.polygon([(0, 0), (size, 0), (size, size)], fill=(*c2, 180))
    # Magenta radial accent
    for i in range(8):
        d.ellipse(
            [size * 0.3 + i, size * 0.2 + i, size * 0.75 - i, size * 0.65 - i],
            outline=(217, 70, 239, max(8, 60 - i * 6)),
        )
    # Tag in mono-bold bottom-left
    try:
        font = ImageFont.truetype(FONT_MONO, max(10, size // 12))
        d.text((6, size - max(14, size // 10)), (tag or "RIBA")[:14],
               fill=(255, 255, 255, 220), font=font)
    except Exception:
        pass
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    return img


def make_mosaic_cover(items: list[dict], album_id: str,
                      title: str = "RIBA Album", canvas: int = 1080) -> Path:
    n = max(1, min(16, len(items)))
    # Grid : 1, 2, 3 → 1xn ; 4 → 2x2 ; 5-9 → 3x3 ; >9 → 4x4
    if n <= 3:        rows, cols = 1, n
    elif n <= 4:      rows, cols = 2, 2
    elif n <= 9:      rows, cols = 3, 3
    else:             rows, cols = 4, 4
    tile_size = canvas // max(rows, cols)
    out = Image.new("RGB", (canvas, canvas), (5, 5, 7))
    for i in range(rows * cols):
        it = items[i % n] if items else {"id": "riba", "tags": []}
        tag = (it.get("tags") or ["RIBA"])[0] if (it.get("tags") or []) else "RIBA"
        tile = _track_tile(seed=str(it.get("id", "")), tag=tag, size=tile_size)
        r, c = i // cols, i % cols
        out.paste(tile, (c * tile_size, r * tile_size))
    # Vignette + title banner bottom
    overlay = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    band_h = canvas // 6
    od.rectangle([0, canvas - band_h, canvas, canvas], fill=(5, 5, 7, 200))
    try:
        font_big = ImageFont.truetype(FONT_BOLD, canvas // 14)
        font_small = ImageFont.truetype(FONT_MONO_R, canvas // 38)
        od.text((canvas // 22, canvas - band_h + 12), title, fill=(250, 250, 250, 255), font=font_big)
        od.text(
            (canvas // 22, canvas - band_h + 12 + canvas // 12),
            f"{n} TRACK{'S' if n > 1 else ''} · BANTU DROP MAP · MADE WITH RIBA",
            fill=(217, 70, 239, 220), font=font_small,
        )
    except Exception:
        pass
    out_rgba = out.convert("RGBA")
    out_rgba.alpha_composite(overlay)
    final = out_rgba.convert("RGB")
    p = COVERS_DIR / f"{album_id}.png"
    final.save(p, "PNG", optimize=True)
    return p


# =========================================================================
# Bantu-grid-aligned crossfade : snap transition_sec to the closest beat
# subdivision of the chosen bantu style so transitions feel "in groove".
# =========================================================================
def _snap_transition_to_bantu_grid(transition_sec: float, style: str) -> float:
    """Snap to the nearest non-zero swing offset around half a bar."""
    grid, _ = _build_bantu_grid(style, density=16, bars=4)
    if not grid:
        return max(0.5, min(3.0, transition_sec))
    # Compute average beat duration (in seconds-like grid units, but the grid is
    # actually in beats); we map "1 beat ≈ 0.5s at 120 BPM".
    deltas = [grid[i + 1] - grid[i] for i in range(len(grid) - 1)]
    avg_beat = sum(deltas) / len(deltas) if deltas else 0.25
    # At 120 BPM a beat is 0.5s ; 1 grid step (16 in 4 bars) ≈ 1 beat → keep ratio.
    second_per_grid_unit = 0.5
    grid_sec = avg_beat * second_per_grid_unit
    # Snap : closest integer multiple of grid_sec to the requested transition.
    if grid_sec <= 0:
        return max(0.5, min(3.0, transition_sec))
    k = max(1, round(transition_sec / grid_sec))
    return max(0.5, min(3.0, k * grid_sec))


# =========================================================================
# Bantu Drop Map — pick best 30s window per track via Snippet Picker.
# =========================================================================
def _pick_segment(audio: Path, segment_sec: float, mode: str) -> tuple[float, float, dict]:
    """Return (start_sec, segment_sec, debug_info)."""
    info = {"mode": mode, "audio": audio.name}
    try:
        d = analyze_snippets(audio, window_sec=max(5, int(round(segment_sec))))
    except Exception as exc:
        info["error"] = str(exc)
        return 0.0, segment_sec, info
    info["snippet_duration"] = d["duration"]
    cands = {c["name"]: c for c in d["candidates"]}
    if mode == "sequential":
        return 0.0, segment_sec, info
    # drop_map : prefer bantu_drop, fall back to peak_energy, then main_hook
    for key in ("bantu_drop", "peak_energy", "main_hook", "full_track"):
        if key in cands:
            info["picked_name"] = key
            info["picked_score"] = cands[key].get("score_norm")
            return float(cands[key]["start_sec"]), segment_sec, info
    return 0.0, segment_sec, info


# =========================================================================
# Endpoint
# =========================================================================
class AlbumTeaserRequest(BaseModel):
    track_ids:        list[str]
    mode:             str = "drop_map"   # "drop_map" | "sequential"
    target_duration:  int = 60
    transition_sec:   float = 1.5
    bantu_style:      str = "bikutsi_44"
    title:            str = "RIBA Album"
    style_label:      str = "Bantu Drop Map"


@router.post("/album/teaser")
async def album_teaser(req: AlbumTeaserRequest):
    ok, _ = _ffmpeg_available()
    if not ok:
        raise HTTPException(503, "ffmpeg not available on this server")
    if not req.track_ids:
        raise HTTPException(400, "track_ids must contain at least 1 ID.")
    if len(req.track_ids) > 16:
        raise HTTPException(400, "Album teaser supports up to 16 tracks.")
    if req.mode not in ("drop_map", "sequential"):
        raise HTTPException(400, "mode must be 'drop_map' or 'sequential'")

    target = max(15, min(120, int(req.target_duration)))
    raw_trans = max(0.5, min(3.0, float(req.transition_sec)))
    transition = _snap_transition_to_bantu_grid(raw_trans, req.bantu_style)

    # 1) Resolve tracks
    resolved: list[tuple[Path, dict]] = []
    for tid in req.track_ids:
        r = _resolve_track(tid)
        if r is None:
            raise HTTPException(404, f"Track not found in workspace: {tid}")
        resolved.append(r)

    n = len(resolved)
    # Per-segment duration so that the FINAL teaser is ~target seconds long.
    # With (n-1) crossfades the actual concat shortens by (n-1)*transition,
    # so each segment must be a bit longer than target/n.
    seg_sec = (target + (n - 1) * transition) / n
    seg_sec = max(4.0, min(target, seg_sec))

    album_id = uuid.uuid4().hex
    out_mp4 = REELS_DIR / f"album_{album_id}.mp4"
    out_mp3 = REELS_DIR / f"album_{album_id}.mp3"
    mix_wav = REELS_DIR / f"album_{album_id}_mix.wav"

    # 2) Pick segments via Snippet Picker
    segments_info: list[dict] = []
    for (audio_path, meta) in resolved:
        start, seg, dbg = await asyncio.to_thread(_pick_segment, audio_path, seg_sec, req.mode)
        segments_info.append({
            "track_id":  meta.get("id"),
            "title":     meta.get("title"),
            "tags":      meta.get("tags", []),
            "start_sec": round(start, 2),
            "seg_sec":   round(seg, 2),
            "audio":     audio_path.name,
            "debug":     dbg,
        })

    # 3) Build a unified audio mixdown WAV via ffmpeg :
    #    - n inputs, each trimmed (-ss start -t seg_sec)
    #    - chained acrossfade transitions for seamless flow
    #    - normalize to mono 44.1k for showcqt downstream
    in_args: list[str] = []
    for (audio_path, _), seg in zip(resolved, segments_info):
        in_args += ["-ss", f"{seg['start_sec']:.3f}", "-t", f"{seg['seg_sec']:.3f}", "-i", str(audio_path)]

    # Build crossfade chain
    if n == 1:
        fc = "[0:a]aformat=channel_layouts=stereo,aresample=44100[mix]"
    else:
        chain_parts: list[str] = []
        prev_label = f"[0:a]"
        # First input gets a small fade-in
        chain_parts.append(f"{prev_label}aformat=channel_layouts=stereo,aresample=44100,afade=t=in:st=0:d=0.3[a0]")
        prev_label = "[a0]"
        for i in range(1, n):
            curr_in = f"[{i}:a]"
            curr_fix = f"{curr_in}aformat=channel_layouts=stereo,aresample=44100[ai{i}]"
            chain_parts.append(curr_fix)
            out_label = "[mix]" if i == n - 1 else f"[x{i}]"
            chain_parts.append(f"{prev_label}[ai{i}]acrossfade=d={transition:.3f}:c1=tri:c2=tri{out_label}")
            prev_label = out_label
        # final fade-out
        chain_parts[-1] = chain_parts[-1].replace("[mix]", "[xmix]")
        chain_parts.append(f"[xmix]afade=t=out:st={max(0.0, target - 0.6):.3f}:d=0.6[mix]")
        fc = ";".join(chain_parts)

    mix_args = ["ffmpeg", "-y"] + in_args + [
        "-filter_complex", fc,
        "-map", "[mix]",
        "-t", str(target),
        "-c:a", "pcm_s16le", "-ar", "44100",
        str(mix_wav),
    ]
    code, err = await _run_ffmpeg(mix_args, timeout=240)
    if code != 0 or not mix_wav.exists():
        raise HTTPException(500, f"ffmpeg mix failed (code={code}): {err[-600:]}")

    # 4) Mosaic cover
    cover_path = make_mosaic_cover([r[1] for r in resolved], album_id, title=req.title)

    # 5) Render the final reel from the mixdown (reuse showcqt+drawtext pipeline)
    w, h = FORMATS["square_1080"]
    watermark = "Made with RIBA · Bantu Drop Map"
    fc_reel = _build_filter_complex(w, h, req.title, req.style_label, watermark)
    reel_args = [
        "ffmpeg", "-y",
        "-i", str(mix_wav),
        "-filter_complex", fc_reel,
        "-map", "[v]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-t", str(target),
        "-movflags", "+faststart",
        str(out_mp4),
    ]
    code2, err2 = await _run_ffmpeg(reel_args, timeout=300)
    if code2 != 0 or not out_mp4.exists():
        raise HTTPException(500, f"ffmpeg reel failed (code={code2}): {err2[-600:]}")

    # 6) MP3 export of the mixdown (audio-only sharing)
    mp3_args = ["ffmpeg", "-y", "-i", str(mix_wav),
                "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3",
                "-metadata", f"title={req.title}", "-metadata", "artist=RIBA",
                "-metadata", f"genre={req.style_label}",
                "-metadata", "comment=Made with RIBA · Bantu Drop Map",
                "-t", str(target), str(out_mp3)]
    code3, err3 = await _run_ffmpeg(mp3_args, timeout=60)
    mp3_url, mp3_bytes = None, 0
    if code3 == 0 and out_mp3.exists():
        mp3_url = f"/api/ai/workspace/reel/{out_mp3.name}"
        mp3_bytes = out_mp3.stat().st_size

    # cleanup temp WAV
    try: mix_wav.unlink(missing_ok=True)
    except Exception: pass

    return {
        "id":              album_id,
        "kind":            "album_teaser",
        "title":           req.title,
        "style_label":     req.style_label,
        "mode":            req.mode,
        "duration":        target,
        "tracks":          n,
        "transition_sec":  round(transition, 3),
        "transition_raw":  round(raw_trans, 3),
        "bantu_style":     req.bantu_style,
        "mp4_url":         f"/api/ai/workspace/reel/{out_mp4.name}",
        "mp4_bytes":       out_mp4.stat().st_size,
        "mp3_url":         mp3_url,
        "mp3_bytes":       mp3_bytes,
        "cover_url":       f"/api/ai/album/cover/{album_id}.png",
        "segments":        segments_info,
    }


@router.get("/album/cover/{filename}")
def serve_cover(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    p = COVERS_DIR / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "Album cover not found")
    return FileResponse(p, media_type="image/png", filename=filename)
