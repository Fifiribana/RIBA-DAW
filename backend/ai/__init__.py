"""RIBA AI module — exposes all routers."""
from .assistant import router as assistant_router
from .generator import router as generator_router
from .genesis import router as genesis_router
from .music import router as music_router
from .stems import router as stems_router
from .remix import router as remix_router
from .reel import router as reel_router
from .snippets import router as snippets_router
from .share import router as share_router
from .album import router as album_router
from .promo import router as promo_router
from .studio_live import router as studio_live_router
from .translate import router as translate_router
from .storytelling import router as storytelling_router
from .scheduler import start_scheduler, shutdown_scheduler

__all__ = [
    "assistant_router",
    "generator_router",
    "genesis_router",
    "music_router",
    "stems_router",
    "remix_router",
    "reel_router",
    "snippets_router",
    "share_router",
    "album_router",
    "promo_router",
    "studio_live_router",
    "translate_router",
    "storytelling_router",
    "start_scheduler",
    "shutdown_scheduler",
]
