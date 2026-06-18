"""
RIBA Magic Re-mix — the signature RIBA chain:
   uploaded audio → Demucs (4 stems) → Bantu Oral Grid (asymmetric quantization)
   → optional fal.ai re-instrumentation (Bantu groove layer)

Endpoints (all under /api/ai):
    GET  /remix-status       → probe (fal_ready + demucs_ready + mode)
    POST /magic-remix        → multipart form-data:
        file (required)      → WAV/MP3 upload
        bantu_style          → asiko_wisdom | makossa_roots | bikutsi_44 |
                               bikutsi_68 | bikutsi_1224       (default bikutsi_44)
        density              → int 2..256                       (default 16)
        bars                 → float                            (default 4.0)
        regenerate           → "true"/"false"                   (default false)
        regen_prompt         → str  (used when regenerate=true)
        regen_duration       → int seconds 5..60                (default 15)

    Response:
    {
      "id": "uuid",
      "source": "<filename>",
      "bantu": { style, density, bars, time_stamps_beats, description },
      "stems": {
         vocals/drums/bass/other: { name, wav_base64, bytes },
         bantu_groove (optional): { name, wav_base64, bytes, model, source_url }
      },
      "mode": "demucs_only" | "full"
    }
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .stems import _separate_file  # reuse the Demucs pipeline

router = APIRouter(prefix="/ai", tags=["ai-remix"])
log = logging.getLogger("riba.remix")


# -------- Bantu Grid (mirror of server.py logic, kept local to avoid circular imports) --------
def _build_bantu_grid(style: str, density: int, bars: float):
    if density < 2:   density = 2
    if density > 256: density = 256
    total_beats = bars * 4.0
    base = [i * (total_beats / density) for i in range(density)]
    s = style.lower()

    def _apply_swing(arr, offsets):
        return [arr[i] + offsets[i % len(offsets)] for i in range(len(arr))]

    if s == "asiko_wisdom":
        out = list(base)
        for i in range(len(out)):
            if i % 3 == 0: out[i] += 0.10
            elif i % 7 == 0: out[i] -= 0.06
        desc = "Asiko (sagesse): anticipation sur 3e impact, tension retardée sur 7e."
    elif s == "makossa_roots":
        out = _apply_swing(base, [0.0, 0.16, -0.08, 0.04])
        desc = "Makossa: syncope basse-pulsation, accentuation backbeat ternaire."
    elif s == "bikutsi_44":
        swing = [0.0, 0.20, 0.40, 0.0, 0.20, 0.40, 0.0, 0.20]
        out = _apply_swing(base, swing[:(density % 8 or 8)])
        for i in range(len(out)):
            if i % 4 == 2: out[i] += 0.08
        desc = "Bikutsi 4/4 (8 ternaire): pulsation rapide, accent sur le contretemps fort."
    elif s == "bikutsi_68":
        swing = [0.0, 0.18, 0.32, 0.50, 0.66, 0.82]
        out = []
        for i in range(density):
            cycle = i % 6
            bar_idx = i // 6
            out.append((swing[cycle] + bar_idx * 1.0) * (total_beats / max(1, density / 6)))
        desc = "Bikutsi 6/8: groupement ternaire, accents 1 et 4."
    elif s == "bikutsi_1224":
        out = []
        for i in range(density):
            beat = (i / density) * total_beats
            if i % 3 == 0: beat -= 0.04
            if i % 4 == 0: beat += 0.05
            out.append(beat)
        desc = "Bikutsi 12/24: polyrythmie 3-contre-4, micro-décalages denses."
    else:
        return None, None
    out = [max(0.0, min(total_beats, round(v, 4))) for v in out]
    return out, desc


@router.get("/remix-status")
def remix_status():
    """Tells the UI whether the FULL Re-mix chain is available (Demucs + fal.ai),
    or only the Demucs+Bantu part."""
    fal = os.getenv("FAL_KEY", "").strip()
    fal_ready = bool(fal) and fal != "your_fal_key_here"
    try:
        import demucs  # type: ignore  # noqa: F401
        import torch    # type: ignore  # noqa: F401
        demucs_ready = True
    except ImportError:
        demucs_ready = False
    mode = "full" if (fal_ready and demucs_ready) else ("demucs_only" if demucs_ready else "unavailable")
    return {
        "ready":        demucs_ready,         # remix needs demucs at minimum
        "fal_ready":    fal_ready,
        "demucs_ready": demucs_ready,
        "mode":         mode,
        "default_bantu": {"style": "bikutsi_44", "density": 16, "bars": 4},
        "available_styles": ["asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224"],
    }


async def _generate_bantu_groove(prompt: str, style: str, duration: int) -> dict | None:
    """fal.ai re-instrumentation pass — generates a percussive bantu layer."""
    fal_key = os.getenv("FAL_KEY", "").strip()
    if not fal_key or fal_key in ("", "your_fal_key_here"):
        return None
    try:
        import fal_client  # type: ignore
    except ImportError as exc:
        log.warning("fal-client not available: %s", exc)
        return None

    os.environ["FAL_KEY"] = fal_key
    slug = "fal-ai/stable-audio"
    # style-aware prompt: keep instructions short but rich
    full_prompt = (
        f"instrumental, percussive Bantu groove, {style.replace('_', ' ')} pattern, "
        f"polyrhythmic African drums, {prompt}".strip(", ")
    )
    args = {
        "prompt": full_prompt,
        "seconds_total": max(5, min(60, int(duration))),
        "duration": max(5, min(60, int(duration))),
    }
    try:
        handler = await fal_client.submit_async(slug, arguments=args)
        result = await asyncio.wait_for(handler.get(), timeout=180)
    except Exception as exc:
        log.warning("fal.ai bantu groove gen failed: %s", exc)
        return None

    audio = result.get("audio_file") or result.get("audio") or {}
    url = audio.get("url") if isinstance(audio, dict) else None
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            wav_bytes = resp.content
    except Exception as exc:
        log.warning("download bantu groove failed: %s", exc)
        return None

    return {
        "name": "bantu_groove",
        "wav_base64": base64.b64encode(wav_bytes).decode("ascii"),
        "bytes": len(wav_bytes),
        "model": slug,
        "source_url": url,
    }


@router.post("/magic-remix")
async def magic_remix(
    file: UploadFile = File(...),
    bantu_style: str = Form("bikutsi_44"),
    density: int = Form(16),
    bars: float = Form(4.0),
    regenerate: str = Form("false"),
    regen_prompt: str = Form(""),
    regen_duration: int = Form(15),
):
    """Demucs-separate + Bantu-quantize + optional fal.ai bantu-groove regen."""
    grid, desc = _build_bantu_grid(bantu_style, density, bars)
    if grid is None:
        raise HTTPException(400, f"Unknown bantu_style: {bantu_style}")

    tmp_dir = Path(tempfile.mkdtemp(prefix="riba-remix-"))
    in_path = tmp_dir / f"in-{uuid.uuid4().hex}.wav"
    try:
        data = await file.read()
        if not data:
            raise HTTPException(400, "Uploaded file is empty.")
        in_path.write_bytes(data)

        # 1) Demucs separation (off the event loop — CPU bound 30-60 s)
        try:
            stems_raw = await asyncio.to_thread(_separate_file, in_path)
        except HTTPException:
            raise
        except Exception as exc:
            log.exception("demucs in magic-remix failed")
            raise HTTPException(500, f"stem separation failed: {exc}") from exc

        stems_out: dict[str, dict] = {}
        for name, blob in stems_raw.items():
            stems_out[name] = {
                "name": name,
                "wav_base64": base64.b64encode(blob).decode("ascii"),
                "bytes": len(blob),
            }

        # 2) Optional fal.ai bantu groove layer
        want_regen = str(regenerate).strip().lower() in ("1", "true", "yes", "on")
        if want_regen and regen_prompt.strip():
            groove = await _generate_bantu_groove(regen_prompt, bantu_style, regen_duration)
            if groove is not None:
                stems_out["bantu_groove"] = groove

        fal_ready = bool(os.getenv("FAL_KEY", "").strip()) and os.getenv("FAL_KEY") != "your_fal_key_here"
        mode = "full" if ("bantu_groove" in stems_out) else ("demucs_only" if not fal_ready else "demucs_plus_bantu_only")

        return {
            "id": str(uuid.uuid4()),
            "source": file.filename,
            "bantu": {
                "style": bantu_style,
                "density": density,
                "bars": bars,
                "time_stamps_beats": grid,
                "description": desc,
            },
            "stems": stems_out,
            "mode": mode,
        }
    finally:
        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass
