"""
RIBA AI Music Generation via fal.ai MusicGen.
POST /api/ai/generate-music  →  { audio_url, duration, prompt }
The frontend then fetches the WAV/MP3 and decodes it via Web Audio API.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai-music"])


class MusicRequest(BaseModel):
    prompt: str
    duration_seconds: int = 30
    seed: Optional[int] = None
    # fal.ai musicgen variants — keep "stereo-melody" as the high-quality default
    model: str = "stereo-melody"


def _fal_model_slug(variant: str) -> str:
    # Map our short keys to fal.ai endpoint slugs
    return {
        "small":         "fal-ai/musicgen-small",
        "medium":        "fal-ai/musicgen-medium",
        "large":         "fal-ai/musicgen-large",
        "stereo":        "fal-ai/musicgen-stereo",
        "stereo-large":  "fal-ai/musicgen-stereo-large",
        "stereo-melody": "fal-ai/musicgen-stereo-melody",
    }.get(variant, "fal-ai/musicgen-stereo")


@router.post("/generate-music")
async def generate_music(req: MusicRequest):
    fal_key = os.getenv("FAL_KEY", "").strip()
    if not fal_key or fal_key in ("", "your_fal_key_here"):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "FAL_KEY_MISSING",
                "message": (
                    "fal.ai key not configured. Set FAL_KEY in /app/backend/.env "
                    "(get one at https://fal.ai/dashboard/keys) then restart the backend."
                ),
            },
        )

    try:
        import fal_client  # type: ignore
    except ImportError as exc:
        raise HTTPException(500, f"fal-client not installed: {exc}") from exc

    # fal_client reads FAL_KEY from env directly
    os.environ["FAL_KEY"] = fal_key
    slug = _fal_model_slug(req.model)

    args = {
        "prompt": req.prompt,
        "duration": max(5, min(90, int(req.duration_seconds))),
    }
    if req.seed is not None:
        args["seed"] = int(req.seed)

    try:
        handler = await fal_client.submit_async(slug, arguments=args)
        result = await handler.get()
    except Exception as exc:
        raise HTTPException(502, f"fal.ai generation failed: {exc}") from exc

    # MusicGen returns: { "audio_file": { "url": "...wav", "content_type": "audio/wav" } }
    audio = result.get("audio_file") or result.get("audio") or {}
    url = audio.get("url") if isinstance(audio, dict) else None
    if not url:
        raise HTTPException(502, f"fal.ai response missing audio URL: keys={list(result.keys())}")

    return {
        "id": str(uuid.uuid4()),
        "prompt": req.prompt,
        "duration": req.duration_seconds,
        "model": slug,
        "audio_url": url,
        "content_type": audio.get("content_type", "audio/wav") if isinstance(audio, dict) else "audio/wav",
    }


@router.get("/music-status")
def music_status():
    """Light-weight readiness probe — UI uses this to decide whether to show the
    'Dream Track' button as ENABLED (real generation) or in fallback mode."""
    fal_key = os.getenv("FAL_KEY", "").strip()
    enabled = bool(fal_key) and fal_key != "your_fal_key_here"
    return {
        "enabled": enabled,
        "provider": "fal.ai" if enabled else None,
        "default_model": "fal-ai/musicgen-stereo-melody",
    }
