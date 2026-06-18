"""
RIBA AI Assistant — translates natural language commands into structured
RIBA actions executable by the frontend reducer.

Usage:
    POST /api/ai/assistant
    body: { "message": "...", "session_id": "...", "context": { ... } }

Returns:
    { "actions": [...], "speech": "...", "session_id": "..." }
"""
from __future__ import annotations

import json
import os
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai-assistant"])

SYSTEM_PROMPT = """You are RIBA, an AI co-producer embedded inside a Pro Tools-style web Digital Audio Workstation.
Your job is to translate the user's natural-language request into a STRICT JSON object describing actions the DAW should perform.

ALWAYS respond with ONLY a JSON object — no markdown fences, no commentary. Schema:
{
  "speech":  "<one-sentence natural confirmation, in the user's language>",
  "actions": [ { "type": "<action>", ...payload } ]
}

Supported action types and their payload (use these EXACT keys):
- {"type":"add_track","kind":"audio|midi","name":"optional"}
- {"type":"delete_track","selector":"selected|index:N|name:..."}
- {"type":"set_volume","selector":"...","volume_percent":0..100}
- {"type":"set_pan","selector":"...","pan":-1..1}
- {"type":"mute","selector":"...","value":true|false}
- {"type":"solo","selector":"...","value":true|false}
- {"type":"set_tempo","bpm":40..240}
- {"type":"set_time_signature","numerator":2..12,"denominator":4|8}
- {"type":"toggle_metronome","value":true|false}
- {"type":"toggle_loop","value":true|false}
- {"type":"play"} | {"type":"stop"} | {"type":"record"}
- {"type":"apply_effect","selector":"...","effect":"reverb|delay|eq|filter|reverse|gain","amount":0..1}
- {"type":"set_bantu_grid","style":"asiko_wisdom|makossa_roots|bikutsi_44|bikutsi_68|bikutsi_1224","density":4..64,"bars":1..16}
- {"type":"toggle_bantu_swing","value":true|false,"intensity":0..1}
- {"type":"toggle_bantu_markers","value":true|false}
- {"type":"open_modal","modal":"mixer|bantu|setup|dream|history|disk_usage|system_usage|plugins|gm|manual"}
- {"type":"set_waveform_mode","mode":"peak|power|rectified|outlines|crossfades"}
- {"type":"generate_dream","prompt":"...","duration_seconds":15..90}
- {"type":"separate_stems","selector":"..."}

Rules:
1. If the request is ambiguous, ask a follow-up via "speech" with actions=[].
2. NEVER invent action types not in the list above.
3. Selector "selected" means the currently selected track. Default to "selected" for per-track actions when no track is named.
4. Respond in the user's language for the "speech" field.
5. Keep "actions" empty when the user is only chatting.
"""


class AssistantRequest(BaseModel):
    message: str
    session_id: str | None = None
    context: dict[str, Any] | None = None


@router.post("/assistant")
async def ai_assistant(req: AssistantRequest):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError as exc:
        raise HTTPException(500, f"emergentintegrations not installed: {exc}") from exc

    session_id = req.session_id or str(uuid.uuid4())
    ctx_block = (
        f"\n\nCurrent DAW context (read-only):\n{json.dumps(req.context, ensure_ascii=False)}"
        if req.context else ""
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=SYSTEM_PROMPT + ctx_block,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        reply = await chat.send_message(UserMessage(text=req.message))
    except Exception as exc:
        # Graceful fallback when LLM budget is exhausted or network fails
        return {
            "session_id": session_id,
            "speech": f"AI unavailable: {type(exc).__name__}. Using local interpreter fallback.",
            "actions": _local_fallback(req.message),
            "fallback": True,
        }

    text = str(reply).strip()
    # Strip markdown fences if the LLM added any
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text else text
        if text.lstrip().lower().startswith("json"):
            text = text.split("\n", 1)[1] if "\n" in text else text
    try:
        parsed = json.loads(text.strip())
        actions = parsed.get("actions", []) if isinstance(parsed, dict) else []
        speech = parsed.get("speech", "") if isinstance(parsed, dict) else ""
    except json.JSONDecodeError:
        actions = _local_fallback(req.message)
        speech = text[:160]

    return {
        "session_id": session_id,
        "speech": speech,
        "actions": actions,
        "fallback": False,
    }


def _local_fallback(msg: str) -> list[dict]:
    """Tiny offline interpreter — covers a handful of common phrases when the LLM is down."""
    m = msg.lower()
    if any(k in m for k in ["add audio", "ajoute une piste audio", "nouvelle piste audio"]):
        return [{"type": "add_track", "kind": "audio"}]
    if any(k in m for k in ["add midi", "ajoute midi", "nouvelle piste midi"]):
        return [{"type": "add_track", "kind": "midi"}]
    if "play" in m or "lecture" in m or "joue" in m:
        return [{"type": "play"}]
    if "stop" in m or "arrête" in m or "arret" in m:
        return [{"type": "stop"}]
    if "metronome" in m or "métronome" in m:
        return [{"type": "toggle_metronome", "value": True}]
    if "reverb" in m or "réverb" in m or "reverberation" in m:
        return [{"type": "apply_effect", "selector": "selected", "effect": "reverb", "amount": 0.4}]
    return []
