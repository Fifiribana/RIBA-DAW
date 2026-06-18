"""
RIBA Magic Generator — Suno-style lyrics + workspace orchestration.

Endpoints (all under /api/ai):
    POST /generate-lyrics      → Claude-powered lyrics structured by [Verse]/[Chorus]
    GET  /workspace            → list saved generations (lyrics + music)
    DELETE /workspace/{id}     → remove one
    GET  /workspace/file/{id}  → serve the WAV directly
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai-generator"])

WORKSPACE = Path(__file__).resolve().parents[1] / "static" / "workspace"
WORKSPACE.mkdir(parents=True, exist_ok=True)
INDEX_FILE = WORKSPACE / "index.json"


# ---------- helpers ----------
def _load_index() -> list[dict]:
    if not INDEX_FILE.exists():
        return []
    try:
        return json.loads(INDEX_FILE.read_text())
    except Exception:
        return []


def _save_index(items: list[dict]) -> None:
    INDEX_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2))


def _push_entry(entry: dict) -> dict:
    entry.setdefault("id", str(uuid.uuid4()))
    entry.setdefault("created_at", int(time.time()))
    items = _load_index()
    items.insert(0, entry)
    _save_index(items[:60])  # cap at 60 most recent
    return entry


# ---------- lyrics ----------
LYRICS_SYSTEM = """You are RIBA, an AI lyricist for a Pro Tools-style DAW.
Generate structured song lyrics in the user's language for the given prompt.

ALWAYS output ONLY a JSON object — no markdown fences. Schema:
{
  "title":  "<short evocative title>",
  "style":  "<style hint matching the prompt, e.g. Bikutsi 4/4, Afrobeat, Rumba>",
  "tags":   ["TAG1","TAG2","TAG3"],
  "sections": [
    { "type": "Verse"|"Chorus"|"Bridge"|"Pre-Chorus"|"Outro", "text": "line1\\nline2\\nline3\\nline4" }
  ]
}

Rules:
- 1 Verse + 1 Chorus minimum. Aim for 2-3 verses + 1 chorus + optional bridge.
- Keep each section 4-8 lines, no more than 9 syllables per line.
- Match the cultural register of the requested style (e.g. Bantu/Cameroon for Bikutsi).
- TAGS are uppercase single words like RUMBA, BIKUTSI, LOVE, NIGHT.
"""


class LyricsRequest(BaseModel):
    prompt: str
    style: str | None = None
    language: str | None = None
    session_id: str | None = None


@router.post("/generate-lyrics")
async def generate_lyrics(req: LyricsRequest):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")

    user_msg = f"Theme/prompt: {req.prompt}"
    if req.style:
        user_msg += f"\nStyle: {req.style}"
    if req.language:
        user_msg += f"\nLanguage: {req.language}"

    session_id = req.session_id or str(uuid.uuid4())
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(api_key=api_key, session_id=session_id,
                       system_message=LYRICS_SYSTEM).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=user_msg))
        text = str(reply).strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1] if "```" in text else text
            if text.lstrip().lower().startswith("json"):
                text = text.split("\n", 1)[1] if "\n" in text else text
        parsed = json.loads(text.strip())
        entry = _push_entry({
            "kind": "lyrics",
            "prompt": req.prompt,
            "style": req.style or parsed.get("style", ""),
            "title": parsed.get("title", "Untitled"),
            "tags": parsed.get("tags", []),
            "sections": parsed.get("sections", []),
            "fallback": False,
        })
        return entry
    except Exception as exc:  # noqa: BLE001
        entry = _push_entry({
            "kind": "lyrics",
            "prompt": req.prompt,
            "style": req.style or "Bantu",
            "title": _local_title(req.prompt),
            "tags": _local_tags(req.style, req.prompt),
            "sections": _local_sections(req.prompt, req.style),
            "fallback": True,
            "fallback_reason": type(exc).__name__,
        })
        return entry


def _local_title(prompt: str) -> str:
    words = [w for w in re.split(r"\W+", prompt) if w]
    return " ".join(words[:4]).title() or "Bantu Dream"


def _local_tags(style: str | None, prompt: str) -> list[str]:
    base = (style or "BANTU").upper().split()[:1]
    extra = [w.upper() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", prompt)][:3]
    out = (base + extra + ["RIBA"])[:4]
    return out


def _local_sections(prompt: str, style: str | None) -> list[dict]:
    s = (style or "Bantu groove").strip()
    return [
        {"type": "Verse",  "text": f"In the heart of the {s} night\nDrums awake the ancient fire\nVoices rise above the light\nThe groove pulls us higher"},
        {"type": "Chorus", "text": f"{prompt.strip()[:48]}\nThe phoenix flies tonight\nBikutsi in our soul\nRIBA makes it right"},
        {"type": "Verse",  "text": "From the river to the sun\nWe dance until the dawn appears\nEvery beat is one with one\nWashing all our fears"},
    ]


# ---------- music wrapper (re-uses fal.ai pipeline + saves locally) ----------
class MusicGenRequest(BaseModel):
    prompt: str
    duration_seconds: int = 30
    style: str | None = None
    instrumental: bool = True
    model: str = "stereo-melody"


@router.post("/generate-track")
async def generate_track(req: MusicGenRequest):
    """Generates music via fal.ai, downloads the WAV into /static/workspace,
    indexes it and returns the new entry. Falls back to a 'lyrics-only' card
    when FAL_KEY isn't configured."""
    fal_key = os.getenv("FAL_KEY", "").strip()
    style_str = req.style or ""
    full_prompt = f"{style_str}, {req.prompt}".strip(", ") if style_str else req.prompt
    if req.instrumental:
        full_prompt = f"instrumental, {full_prompt}"

    entry = {
        "kind": "music",
        "prompt": req.prompt,
        "style": style_str,
        "title": _local_title(req.prompt),
        "tags": _local_tags(req.style, req.prompt),
        "duration": req.duration_seconds,
        "instrumental": req.instrumental,
    }

    if not fal_key or fal_key in ("", "your_fal_key_here"):
        entry.update({
            "fallback": True,
            "fallback_reason": "FAL_KEY_MISSING",
            "message": "fal.ai key not configured — generated placeholder card only.",
            "audio_url": None,
        })
        return _push_entry(entry)

    try:
        import fal_client  # type: ignore
        os.environ["FAL_KEY"] = fal_key
        slug = f"fal-ai/musicgen-{req.model}" if not req.model.startswith("fal-ai/") else req.model
        args = {"prompt": full_prompt, "duration": max(5, min(90, int(req.duration_seconds)))}
        handler = await fal_client.submit_async(slug, arguments=args)
        result = await asyncio.wait_for(handler.get(), timeout=180)
        audio = result.get("audio_file") or result.get("audio") or {}
        url = audio.get("url") if isinstance(audio, dict) else None
        if not url:
            raise RuntimeError(f"fal.ai response missing audio URL: keys={list(result.keys())}")

        # download into workspace
        out_id = str(uuid.uuid4())
        out_path = WORKSPACE / f"{out_id}.wav"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            out_path.write_bytes(resp.content)

        entry.update({
            "id": out_id,
            "fallback": False,
            "audio_url": f"/api/ai/workspace/file/{out_id}",
            "source_url": url,
            "model": slug,
            "bytes": out_path.stat().st_size,
        })
        return _push_entry(entry)
    except Exception as exc:  # noqa: BLE001
        entry.update({"fallback": True, "fallback_reason": type(exc).__name__, "audio_url": None})
        return _push_entry(entry)


# ---------- workspace ----------
@router.get("/workspace")
def list_workspace():
    return {"items": _load_index()}


@router.delete("/workspace/{item_id}")
def delete_item(item_id: str):
    items = _load_index()
    keep = [it for it in items if it.get("id") != item_id]
    _save_index(keep)
    wav = WORKSPACE / f"{item_id}.wav"
    if wav.exists():
        wav.unlink(missing_ok=True)
    return {"deleted": item_id, "remaining": len(keep)}


@router.get("/workspace/file/{item_id}")
def get_workspace_file(item_id: str):
    p = WORKSPACE / f"{item_id}.wav"
    if not p.exists():
        raise HTTPException(404, "audio not found")
    return FileResponse(p, media_type="audio/wav", filename=f"{item_id}.wav")
