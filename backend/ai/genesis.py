"""
RIBA Genesis — one-button workflow: prompt → music → stem separation → 4 stems ready to mix.
The frontend orchestrates the chain step-by-step to display progress; this module exposes a
single helper endpoint that the UI calls when FAL_KEY is configured, and returns either:
  - { ready: true, track: {...}, stems: {...} }
  - { ready: false, reason: 'FAL_KEY_MISSING', track: null, instructions: '...' }

The actual chaining (generate-track → separate-stems → create tracks → enable Bantu Grid)
is done by the frontend Daw.dispatchGenesis() to keep this endpoint stateless.
"""
from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai-genesis"])


class GenesisProbe(BaseModel):
    pass


@router.get("/genesis-status")
def genesis_status():
    """Tells the UI whether the FULL Genesis chain is available (fal.ai + Demucs)
    or only the second half (Demucs from a user-uploaded WAV)."""
    fal = os.getenv("FAL_KEY", "").strip()
    fal_ready = bool(fal) and fal != "your_fal_key_here"
    try:
        import demucs  # type: ignore  # noqa: F401
        import torch    # type: ignore  # noqa: F401
        demucs_ready = True
    except ImportError:
        demucs_ready = False
    return {
        "ready":          fal_ready and demucs_ready,
        "fal_ready":      fal_ready,
        "demucs_ready":   demucs_ready,
        "mode":           "full" if (fal_ready and demucs_ready) else ("demucs_only" if demucs_ready else "unavailable"),
        "default_style":  "Bikutsi tropical house",
        "default_bantu":  {"style": "bikutsi_44", "density": 16, "bars": 4},
    }
