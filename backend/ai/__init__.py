"""RIBA AI module — exposes assistant, music generation, and stem separation routes."""
from .assistant import router as assistant_router
from .generator import router as generator_router
from .genesis import router as genesis_router
from .music import router as music_router
from .stems import router as stems_router

__all__ = ["assistant_router", "generator_router", "genesis_router", "music_router", "stems_router"]
