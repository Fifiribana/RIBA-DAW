"""RIBA AI module — assistant, music, stems, remix, reel, snippets routers."""
from .assistant import router as assistant_router
from .generator import router as generator_router
from .genesis import router as genesis_router
from .music import router as music_router
from .stems import router as stems_router
from .remix import router as remix_router
from .reel import router as reel_router
from .snippets import router as snippets_router

__all__ = [
    "assistant_router",
    "generator_router",
    "genesis_router",
    "music_router",
    "stems_router",
    "remix_router",
    "reel_router",
    "snippets_router",
]
