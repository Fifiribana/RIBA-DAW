"""
RIBA AI Translate — dynamic translation endpoint for tutorials, Bantu style
descriptions, and any rich text that isn't covered by the static i18n bundles.

Powered by Claude via the Emergent LLM Key. Falls back to identity (returns the
input text untouched) when the key/budget is unavailable, so the frontend can
keep rendering content gracefully.

Usage:
    POST /api/ai/translate
    body: { "text": "...", "target_lang": "fr", "source_lang": "en" | null }

Returns:
    { "text": "...", "target_lang": "fr", "fallback": false }
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ai", tags=["ai-translate"])

# Friendly names so Claude knows what locale code maps to (the codes alone are
# sometimes ambiguous, e.g. "sw" — Swahili vs Swedish "sv").
LANG_LABELS = {
    "fr": "French",
    "en": "English",
    "es": "Spanish",
    "pt": "Portuguese",
    "sw": "Swahili",
    "de": "German",
    "it": "Italian",
}


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    target_lang: str = Field(..., min_length=2, max_length=8)
    source_lang: Optional[str] = None
    context: Optional[str] = Field(
        None,
        description="Optional hint, e.g. 'Bantu rhythm style description'.",
    )


class TranslateBatchRequest(BaseModel):
    items: dict[str, str] = Field(..., description="key -> text")
    target_lang: str = Field(..., min_length=2, max_length=8)
    source_lang: Optional[str] = None
    context: Optional[str] = None


def _build_system_prompt(target: str, source: Optional[str], context: Optional[str]) -> str:
    tgt = LANG_LABELS.get(target.lower(), target)
    src = LANG_LABELS.get((source or "").lower(), source or "auto-detected")
    extra = f"\nDomain hint: {context}" if context else ""
    return (
        f"You are a professional localization translator for the RIBA Bantu DAW "
        f"(Digital Audio Workstation).\n"
        f"Translate the user's text from {src} to {tgt}.\n"
        f"Preserve technical jargon (DAW, BPM, MIDI, EQ, stems, Bikutsi, Makossa, Asiko).\n"
        f"Keep markdown / line-breaks / numbers intact.\n"
        f"Return ONLY the translated text — no quotes, no preface, no markdown fence."
        f"{extra}"
    )


@router.get("/translate-status")
async def translate_status():
    """Quick health probe — does not consume LLM credits."""
    return {
        "enabled": bool(os.getenv("EMERGENT_LLM_KEY")),
        "provider": "anthropic/claude-sonnet-4-6" if os.getenv("EMERGENT_LLM_KEY") else None,
        "languages": sorted(LANG_LABELS.keys()),
    }


@router.post("/translate")
async def ai_translate(req: TranslateRequest):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        # Identity fallback — frontend falls back to source string seamlessly
        return {"text": req.text, "target_lang": req.target_lang, "fallback": True,
                "fallback_reason": "EMERGENT_LLM_KEY not configured"}

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError as exc:
        raise HTTPException(500, f"emergentintegrations not installed: {exc}") from exc

    chat = LlmChat(
        api_key=api_key,
        session_id=str(uuid.uuid4()),
        system_message=_build_system_prompt(req.target_lang, req.source_lang, req.context),
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        reply = await chat.send_message(UserMessage(text=req.text))
    except Exception as exc:  # noqa: BLE001 — graceful fallback on any LLM failure
        return {
            "text": req.text,
            "target_lang": req.target_lang,
            "fallback": True,
            "fallback_reason": type(exc).__name__,
        }

    translated = str(reply).strip()
    # Strip accidental code fences
    if translated.startswith("```"):
        parts = translated.split("```")
        translated = parts[1] if len(parts) > 1 else translated
        if translated.lstrip().lower().startswith(("text", "markdown")):
            translated = translated.split("\n", 1)[1] if "\n" in translated else translated
        translated = translated.strip()

    return {"text": translated, "target_lang": req.target_lang, "fallback": False}


@router.post("/translate-batch")
async def ai_translate_batch(req: TranslateBatchRequest):
    """Translate a dict of key->text in one shot.

    Useful for translating a whole list of Bantu style descriptions or a tutorial
    section. Falls back to the source text per-key on failure.
    """
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key or not req.items:
        return {
            "items": req.items,
            "target_lang": req.target_lang,
            "fallback": True,
            "fallback_reason": "EMERGENT_LLM_KEY not configured" if not api_key else "empty",
        }

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError as exc:
        raise HTTPException(500, f"emergentintegrations not installed: {exc}") from exc

    tgt = LANG_LABELS.get(req.target_lang.lower(), req.target_lang)
    src = LANG_LABELS.get((req.source_lang or "").lower(), req.source_lang or "auto-detected")
    system_prompt = (
        f"You translate RIBA DAW localization strings from {src} to {tgt}.\n"
        f"You receive a JSON object mapping keys to source strings.\n"
        f"Return ONLY a valid JSON object with the same keys mapped to the translated strings — "
        f"no markdown fences, no commentary. Preserve placeholders like {{var}} and numbers."
    )
    if req.context:
        system_prompt += f"\nDomain hint: {req.context}"

    chat = LlmChat(
        api_key=api_key,
        session_id=str(uuid.uuid4()),
        system_message=system_prompt,
    ).with_model("anthropic", "claude-sonnet-4-6")

    import json
    try:
        reply = await chat.send_message(UserMessage(text=json.dumps(req.items, ensure_ascii=False)))
    except Exception as exc:  # noqa: BLE001
        return {"items": req.items, "target_lang": req.target_lang, "fallback": True,
                "fallback_reason": type(exc).__name__}

    txt = str(reply).strip()
    if txt.startswith("```"):
        parts = txt.split("```")
        txt = parts[1] if len(parts) > 1 else txt
        if txt.lstrip().lower().startswith("json"):
            txt = txt.split("\n", 1)[1] if "\n" in txt else txt
        txt = txt.strip()
    try:
        out = json.loads(txt)
        if not isinstance(out, dict):
            raise ValueError("not a dict")
        # Keep only the keys that were requested, fall back to source for missing ones
        merged = {k: (out[k] if k in out and isinstance(out[k], str) else v)
                  for k, v in req.items.items()}
        return {"items": merged, "target_lang": req.target_lang, "fallback": False}
    except Exception as exc:  # noqa: BLE001
        return {"items": req.items, "target_lang": req.target_lang, "fallback": True,
                "fallback_reason": f"json:{type(exc).__name__}"}
