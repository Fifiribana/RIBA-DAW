"""RIBA AI module — exposes assistant, music generation, stem separation, remix and reel routes."""
from .assistant import router as assistant_router
from .generator import router as generator_router
from .genesis import router as genesis_router
from .music import router as music_router
from .stems import router as stems_router
from .remix import router as remix_router
from .reel import router as reel_router

__all__ = [
    "assistant_router",
    "generator_router",
    "genesis_router",
    "music_router",
    "stems_router",
    "remix_router",
    "reel_router",
]
