"""
RIBA Bantu Reel — viral export pipeline.

Takes any WAV (typically the Magic Re-mix mixdown) and produces:
  • a 1080×1080 (or 1080×1920) MP4 with:
      – CQT spectrum reactive viz (RIBA magenta→indigo gradient)
      – RIBA wordmark + Bantu style badge + watermark "Made with RIBA · Bantu Oral Grid"
  • a parallel MP3 192 kbps for audio-only sharing

All rendering happens via ffmpeg with the showcqt + drawtext filters → fast (3-5×
real-time on CPU), high quality, ready for TikTok / Instagram / YouTube Shorts.

Endpoints (under /api/ai):
    GET  /reel-status           → ffmpeg availability + supported formats
    POST /bantu-reel            → multipart: file, style_label, title, format,
                                  duration_max_sec, with_mp3
    GET  /workspace/reel/{id}.mp4
    GET  /workspace/reel/{id}.mp3
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from shutil import which

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(prefix="/ai", tags=["ai-reel"])
log = logging.getLogger("riba.reel")

REELS = Path(__file__).resolve().parents[1] / "static" / "workspace" / "reels"
REELS.mkdir(parents=True, exist_ok=True)

# Liberation fonts ship with Debian — fallback chain
FONT_BOLD  = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_MONO  = "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"
FONT_MONO_R = "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"

FORMATS = {
    "square_1080":   (1080, 1080),  # Instagram feed + TikTok square
    "reel_1080":     (1080, 1920),  # Reels / Shorts portrait
    "landscape_1080": (1920, 1080), # YouTube
}


def _ffmpeg_available() -> tuple[bool, str | None]:
    binp = which("ffmpeg")
    if not binp:
        return False, None
    try:
        r = subprocess.run([binp, "-version"], capture_output=True, text=True, timeout=4)
        first = (r.stdout.splitlines() or [""])[0]
        return True, first
    except Exception:
        return False, None


def _escape_drawtext(s: str) -> str:
    """ffmpeg drawtext needs : and \\ and ' escaped."""
    return s.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")


@router.get("/reel-status")
def reel_status():
    ok, version = _ffmpeg_available()
    return {
        "available": ok,
        "ffmpeg_version": version,
        "formats": list(FORMATS.keys()),
        "max_duration_sec": 60,
        "watermark": "Made with RIBA · Bantu Oral Grid",
        "default_format": "square_1080",
    }


def _build_filter_complex(
    w: int, h: int, title: str, style_label: str, watermark: str
) -> str:
    """Compose the ffmpeg filter chain : spectrum + brand overlays.

    Stage layout (1080×1080 square example):
        y=  0..160   : RIBA wordmark + style badge
        y=160..900   : CQT spectrum (720 tall)
        y=900..1080  : watermark + bantu grid line
    """
    # showcqt requires even, multiple-of-8 dimensions
    spec_h = max(280, int(h * 0.62))
    spec_h = (spec_h // 16) * 16  # snap to multiple of 16
    spec_y = max(160, int(h * 0.20))
    # RIBA gradient → magenta(0xD946EF rgb=0.85,0.27,0.94)→indigo(0x6366F1 rgb=0.39,0.40,0.95)
    cscheme = "0.85|0.27|0.94|0.39|0.40|0.95"

    # Drawtext layers — order matters (each one stacks)
    title_safe = _escape_drawtext(title or "")
    style_safe = _escape_drawtext(style_label or "")
    wm_safe    = _escape_drawtext(watermark)

    title_layer = (
        f"drawtext=fontfile={FONT_BOLD}:text='{title_safe or 'RIBA'}':"
        f"fontcolor=white:fontsize={int(h*0.085)}:x=(w-text_w)/2:y={int(h*0.045)}:"
        "alpha=0.95,"
        # subtle glow via second pass at lower alpha + larger
        f"drawtext=fontfile={FONT_MONO}:text='{style_safe or 'BANTU'}':"
        f"fontcolor=0xD946EF:fontsize={int(h*0.026)}:x=(w-text_w)/2:y={int(h*0.155)}:"
        f"box=1:boxcolor=0xD946EF@0.15:boxborderw=10"
    )
    wm_layer = (
        f"drawtext=fontfile={FONT_MONO_R}:text='{wm_safe}':"
        f"fontcolor=0x71717A:fontsize={int(h*0.020)}:x=(w-text_w)/2:y=h-{int(h*0.055)}"
    )

    return (
        # Spectrum from the audio input
        f"[0:a]showcqt=s={w}x{spec_h}:r=30:bar_v=9:axis=0:tlength=0.3:basefreq=40:"
        f"endfreq=8000:cscheme={cscheme}[cqt];"
        # Background canvas (true 30 fps so the encoder is happy)
        f"color=c=0x050507:s={w}x{h}:r=30,format=yuv420p[bg];"
        # Overlay spectrum onto background at vertical offset
        f"[bg][cqt]overlay=x=0:y={spec_y}[stage];"
        # Brand layers
        f"[stage]{title_layer},{wm_layer}[v]"
    )


async def _run_ffmpeg(args: list[str], timeout: int = 180) -> tuple[int, str]:
    """Run ffmpeg off the event loop, capture stderr (where ffmpeg logs)."""
    def _go() -> tuple[int, str]:
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
            return r.returncode, (r.stderr or "")[-3500:]
        except subprocess.TimeoutExpired:
            return 124, "ffmpeg timed out"
    return await asyncio.to_thread(_go)


@router.post("/bantu-reel")
async def bantu_reel(
    file: UploadFile = File(...),
    style_label: str = Form("Bikutsi 4/4"),
    title: str = Form("RIBA"),
    format: str = Form("square_1080"),
    duration_max_sec: int = Form(30),
    start_sec: float = Form(0.0),
    with_mp3: str = Form("true"),
    watermark: str = Form("Made with RIBA · Bantu Oral Grid"),
):
    ok, _ = _ffmpeg_available()
    if not ok:
        raise HTTPException(503, "ffmpeg not available on this server")
    if format not in FORMATS:
        raise HTTPException(400, f"Unknown format: {format}. Choices: {list(FORMATS.keys())}")

    duration = max(5, min(60, int(duration_max_sec)))
    start = max(0.0, float(start_sec))
    w, h = FORMATS[format]
    reel_id = uuid.uuid4().hex
    tmp_dir = Path(tempfile.mkdtemp(prefix="riba-reel-"))
    in_path = tmp_dir / f"in-{reel_id}.wav"
    out_mp4 = REELS / f"{reel_id}.mp4"
    out_mp3 = REELS / f"{reel_id}.mp3"

    try:
        data = await file.read()
        if not data:
            raise HTTPException(400, "Uploaded file is empty.")
        in_path.write_bytes(data)

        fc = _build_filter_complex(w, h, title, style_label, watermark)
        # Seek BEFORE the input (-ss before -i) so showcqt + drawtext see only the
        # selected window. This is fast and frame-accurate for our use-case.
        mp4_args = ["ffmpeg", "-y"]
        if start > 0.0:
            mp4_args += ["-ss", f"{start:.3f}"]
        mp4_args += [
            "-i", str(in_path),
            "-filter_complex", fc,
            "-map", "[v]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-t", str(duration),
            "-movflags", "+faststart",
            str(out_mp4),
        ]
        code, err = await _run_ffmpeg(mp4_args, timeout=180)
        if code != 0 or not out_mp4.exists():
            raise HTTPException(500, f"ffmpeg failed (code={code}): {err[-800:]}")

        result: dict = {
            "id":          reel_id,
            "format":      format,
            "width":       w,
            "height":      h,
            "duration":    duration,
            "start_sec":   round(start, 2),
            "title":       title,
            "style_label": style_label,
            "watermark":   watermark,
            "mp4_url":     f"/api/ai/workspace/reel/{reel_id}.mp4",
            "mp4_bytes":   out_mp4.stat().st_size,
        }

        if str(with_mp3).strip().lower() in ("1", "true", "yes", "on"):
            mp3_args = ["ffmpeg", "-y"]
            if start > 0.0:
                mp3_args += ["-ss", f"{start:.3f}"]
            mp3_args += [
                "-i", str(in_path),
                "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3",
                "-metadata", f"title={title}",
                "-metadata", f"artist=RIBA",
                "-metadata", f"genre={style_label}",
                "-metadata", "comment=Made with RIBA · Bantu Oral Grid",
                "-t", str(duration),
                str(out_mp3),
            ]
            code3, err3 = await _run_ffmpeg(mp3_args, timeout=60)
            if code3 == 0 and out_mp3.exists():
                result["mp3_url"]   = f"/api/ai/workspace/reel/{reel_id}.mp3"
                result["mp3_bytes"] = out_mp3.stat().st_size
            else:
                result["mp3_error"] = err3[-200:]

        return result
    finally:
        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass


# ============================================================
# Boot Cinematic — 8 s RIBA intro exportable as MP4 template
# ============================================================
DEFAULT_BOOT_SUBTITLES = [
    "Pioneered in Yaoundé",
    "Polyrhythmics from Central Africa",
    "Bantu Oral Grid by RIBA",
]


def _build_boot_filter(w: int, h: int, subtitles: list[str], total: float) -> str:
    """Procedural 8 s cinematic intro (no audio input).

    Timeline (over `total` seconds, default 8):
      0.0 - 0.8  : fade in background + RIBA wordmark
      0.8 - total-0.8 : wordmark stays, subtitles cycle 1 by 1
      total-0.8 - total : fade-out everything
    """
    n = max(1, min(6, len(subtitles)))
    body = max(2.0, total - 1.6)          # time available for subtitles
    per = body / n                         # each subtitle "window"
    sub_y = int(h * 0.66)
    title_y = int(h * 0.40)
    tagline_y = title_y + int(h * 0.11)
    fade_in_end = 0.8
    fade_out_start = total - 0.8

    title_alpha = (
        f"if(lt(t,{fade_in_end}),t/{fade_in_end},"
        f"if(gt(t,{fade_out_start}),max(0,({total}-t)/0.8),1))"
    )

    title_layer = (
        f"drawtext=fontfile={FONT_BOLD}:text='RIBA':fontcolor=white:fontsize={int(h*0.13)}:"
        f"x=(w-text_w)/2:y={title_y}:alpha='{title_alpha}',"
        f"drawtext=fontfile={FONT_MONO}:text='BANTU DIGITAL AUDIO WORKSTATION':"
        f"fontcolor=0xD946EF:fontsize={int(h*0.022)}:x=(w-text_w)/2:y={tagline_y}:"
        f"alpha='{title_alpha}':box=1:boxcolor=0xD946EF@0.12:boxborderw=10"
    )

    sub_layers: list[str] = []
    for i, raw in enumerate(subtitles):
        t0 = fade_in_end + i * per + 0.1
        t1 = t0 + per - 0.2
        text = _escape_drawtext(raw)
        # smooth alpha : fade in 0.2s, fade out 0.2s
        alpha = (
            f"if(lt(t,{t0}),0,"
            f"if(lt(t,{t0+0.20}),(t-{t0})/0.20,"
            f"if(lt(t,{t1-0.20}),1,"
            f"if(lt(t,{t1}),max(0,({t1}-t)/0.20),0))))"
        )
        sub_layers.append(
            f"drawtext=fontfile={FONT_MONO_R}:text='{text}':"
            f"fontcolor=0xFAFAFA:fontsize={int(h*0.030)}:x=(w-text_w)/2:y={sub_y}:"
            f"alpha='{alpha}'"
        )
    sub_chain = ",".join(sub_layers) if sub_layers else "null"

    # Background : black w/ a slow radial sweep using `geq` would be too heavy.
    # Use a static dark colour + a subtle moving gradient via a colored color source overlayed at low alpha.
    return (
        f"[0:v]format=yuv420p,{title_layer},{sub_chain}[v]"
    )


@router.post("/boot-cinematic")
async def boot_cinematic(
    duration: float = Form(8.0),
    format: str = Form("landscape_1080"),
    subtitles_csv: str = Form("|".join(DEFAULT_BOOT_SUBTITLES)),
    with_drone: str = Form("true"),
):
    """Generate the 8s RIBA cinematic intro as MP4 — no input file required.

    The intro consists of:
      - dark canvas (#050507) + magenta radial accent
      - RIBA wordmark fading in then holding then fading out
      - 3 sequential subtitles centered mid-low
      - optional low drone audio (sine 110 Hz + noise) for impact
    """
    ok, _ = _ffmpeg_available()
    if not ok:
        raise HTTPException(503, "ffmpeg not available on this server")
    if format not in FORMATS:
        raise HTTPException(400, f"Unknown format: {format}. Choices: {list(FORMATS.keys())}")
    dur = max(3.0, min(20.0, float(duration)))
    w, h = FORMATS[format]
    subtitles = [s.strip() for s in subtitles_csv.split("|") if s.strip()] or DEFAULT_BOOT_SUBTITLES
    cine_id = uuid.uuid4().hex
    out_mp4 = REELS / f"boot_{cine_id}.mp4"

    fc = _build_boot_filter(w, h, subtitles, dur)
    use_drone = str(with_drone).strip().lower() in ("1", "true", "yes", "on")

    # lavfi background source (animated soft magenta vignette using `nullsrc` + draw)
    bg_src = f"color=c=0x050507:s={w}x{h}:r=30:d={dur}"
    args: list[str] = ["ffmpeg", "-y", "-f", "lavfi", "-i", bg_src]
    if use_drone:
        # sine + amplitude AM via volume curve gives a cinematic low rumble
        drone = f"sine=f=72:d={dur},volume=0.18,afade=t=in:st=0:d=0.5,afade=t=out:st={dur-0.8}:d=0.8"
        args += ["-f", "lavfi", "-i", drone]
    args += [
        "-filter_complex", fc,
        "-map", "[v]",
    ]
    if use_drone:
        args += ["-map", "1:a", "-c:a", "aac", "-b:a", "128k"]
    args += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-t", f"{dur:.2f}",
        "-movflags", "+faststart",
        str(out_mp4),
    ]
    code, err = await _run_ffmpeg(args, timeout=120)
    if code != 0 or not out_mp4.exists():
        raise HTTPException(500, f"ffmpeg boot-cinematic failed (code={code}): {err[-800:]}")

    return {
        "id":         cine_id,
        "kind":       "boot_cinematic",
        "format":     format,
        "width":      w,
        "height":     h,
        "duration":   round(dur, 2),
        "subtitles":  subtitles,
        "with_drone": use_drone,
        "mp4_url":    f"/api/ai/workspace/reel/boot_{cine_id}.mp4",
        "mp4_bytes":  out_mp4.stat().st_size,
    }


@router.get("/workspace/reel/{filename}")
def serve_reel(filename: str):
    # Basic safety: disallow path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    p = REELS / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "Reel not found")
    ext = p.suffix.lower()
    media_type = "video/mp4" if ext == ".mp4" else "audio/mpeg" if ext == ".mp3" else "application/octet-stream"
    return FileResponse(p, media_type=media_type, filename=filename)


@router.delete("/workspace/reel/{filename}")
def delete_reel(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    p = REELS / filename
    existed = p.exists()
    if existed:
        p.unlink(missing_ok=True)
    return {"deleted": filename, "existed": existed}
