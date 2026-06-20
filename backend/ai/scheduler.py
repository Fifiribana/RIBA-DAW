"""RIBA scheduler — APScheduler background worker.

Sweeps the in-memory share-jobs queue every 30 seconds and fires the publish
for jobs whose `schedule_at` has passed (TikTok & Instagram — YouTube handles
its own scheduling natively via `publishAt`).

Persists scheduled jobs to disk so they survive a backend restart.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore

log = logging.getLogger("riba.scheduler")

PERSIST_FILE = Path(__file__).resolve().parents[1] / "static" / "workspace" / "scheduled_jobs.json"
PERSIST_FILE.parent.mkdir(parents=True, exist_ok=True)

_scheduler: AsyncIOScheduler | None = None


def _load_jobs() -> list[dict]:
    if not PERSIST_FILE.exists():
        return []
    try:
        return json.loads(PERSIST_FILE.read_text())
    except Exception:
        return []


def _save_jobs(jobs: list[dict]) -> None:
    try:
        PERSIST_FILE.write_text(json.dumps(jobs, ensure_ascii=False, indent=2))
    except Exception as exc:
        log.warning("scheduler persist failed: %s", exc)


def schedule_publish_job(platform: str, payload: dict, schedule_at_iso: str) -> dict:
    """Public API : enqueue a future publish job. Returns the persisted record."""
    rec = {
        "platform":     platform,
        "payload":      payload,
        "schedule_at":  schedule_at_iso,
        "status":       "pending",
        "queued_at":    datetime.now(timezone.utc).isoformat(),
    }
    jobs = _load_jobs()
    jobs.append(rec)
    _save_jobs(jobs)
    log.info("scheduled %s @ %s", platform, schedule_at_iso)
    return rec


def list_scheduled_jobs() -> list[dict]:
    return _load_jobs()


async def _execute_due_job(rec: dict) -> None:
    """Lazy-import share publishers so we don't form a cycle."""
    from .share import (
        _publish_tiktok, _publish_instagram, _publish_youtube,
        PublishRequest, _reel_mp4,
    )
    try:
        platform = rec["platform"]
        req = PublishRequest(**rec["payload"])
        reel = _reel_mp4(req.reel_id)
        if platform == "tiktok":
            await _publish_tiktok(reel, req)
        elif platform == "instagram":
            await _publish_instagram(reel, req)
        elif platform == "youtube":
            await asyncio.to_thread(_publish_youtube, reel, req)
        rec["status"] = "published"
        rec["completed_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        rec["status"] = "failed"
        rec["error"] = str(exc)[:300]
        log.exception("scheduled publish failed for %s", rec.get("platform"))


async def _sweep_scheduled_jobs() -> None:
    """Run every 30 s : pick due jobs, execute them, persist outcome."""
    jobs = _load_jobs()
    now = datetime.now(timezone.utc)
    changed = False
    for rec in jobs:
        if rec.get("status") != "pending":
            continue
        try:
            due = datetime.fromisoformat(rec["schedule_at"].replace("Z", "+00:00"))
        except Exception:
            rec["status"] = "failed"; rec["error"] = "bad schedule_at"; changed = True
            continue
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due <= now:
            await _execute_due_job(rec)
            changed = True
    if changed:
        _save_jobs(jobs)


async def _sweep_oauth_refresh() -> None:
    """Run every 2 min — refresh OAuth tokens expiring in the next 5 min."""
    try:
        from .oauth_flow import refresh_expiring_tokens
        report = await refresh_expiring_tokens(window_minutes=5)
        if report["refreshed"] or report["failed"]:
            log.info("oauth refresher: %s", report)
    except Exception as exc:
        log.warning("oauth refresher swallowed exc: %s", exc)


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(_sweep_scheduled_jobs, "interval", seconds=30, id="riba_share_sweep", max_instances=1, coalesce=True)
    _scheduler.add_job(_sweep_oauth_refresh, "interval", minutes=2, id="riba_oauth_refresh", max_instances=1, coalesce=True)
    _scheduler.start()
    log.info("RIBA scheduler started (share sweep 30 s, oauth refresh 2 min)")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        pass
    _scheduler = None
    log.info("RIBA scheduler stopped")
