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
    except Exception as exc:  # noqa: BLE001 — keep service available on any LLM error
        # Graceful fallback when LLM budget is exhausted or network fails
        return {
            "session_id": session_id,
            "speech": "Working in offline mode — please top up Universal Key for full AI features.",
            "actions": _local_fallback(req.message),
            "fallback": True,
            "fallback_reason": type(exc).__name__,
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
    """Offline interpreter — handles common phrases when the LLM is unavailable.

    Uses word-boundary regex to be robust to articles ("add a midi track"),
    extracts tempo numbers, and supports compound sentences joined by "and"/", ".
    """
    import re
    m = msg.lower()
    actions: list[dict] = []

    # add audio / midi
    if re.search(r"\b(add|new|create|nouvelle|ajoute)\b.*\b(midi)\b", m):
        actions.append({"type": "add_track", "kind": "midi"})
    if re.search(r"\b(add|new|create|nouvelle|ajoute)\b.*\b(audio)\b", m):
        actions.append({"type": "add_track", "kind": "audio"})

    # tempo extraction
    mt = re.search(r"(\d{2,3})\s*(?:bpm|tempo)", m)
    if not mt:
        mt = re.search(r"tempo\s*(?:to|à|a|de)?\s*(\d{2,3})", m)
    if mt:
        bpm = int(mt.group(1))
        if 40 <= bpm <= 240:
            actions.append({"type": "set_tempo", "bpm": bpm})

    # transport
    if re.search(r"\b(stop|arr[êe]te|arret)\b", m):
        actions.append({"type": "stop"})
    elif re.search(r"\b(play|lecture|joue|start)\b", m) and "stop" not in m:
        actions.append({"type": "play"})
    if re.search(r"\b(record|enregistre|rec)\b", m):
        actions.append({"type": "record"})

    # metronome
    if re.search(r"metro\w*|m[ée]tro\w*", m):
        on = not re.search(r"(off|d[ée]sactiv|disable|stop)\s*metro", m)
        actions.append({"type": "toggle_metronome", "value": on})

    # loop
    if re.search(r"\bloop\b|\bboucle\b", m):
        actions.append({"type": "toggle_loop", "value": True})

    # effects
    fx_map = [("reverb", "reverb"), ("réverb", "reverb"), ("delay", "delay"),
              ("eq", "eq"), ("filter", "filter"), ("reverse", "reverse"), ("gain", "gain")]
    for needle, fx in fx_map:
        if needle in m:
            actions.append({"type": "apply_effect", "selector": "selected", "effect": fx, "amount": 0.4})
            break

    # bantu / swing
    if re.search(r"swing", m):
        actions.append({"type": "toggle_bantu_swing", "value": True, "intensity": 0.7})
    for style_key in ("asiko_wisdom", "makossa_roots", "bikutsi_1224", "bikutsi_68", "bikutsi_44"):
        # match either the explicit id or the human form ("bikutsi 4/4")
        human = style_key.replace("_", " ").replace("44", "4/4").replace("68", "6/8").replace("1224", "12/24")
        if style_key in m or human in m or human.split()[0] in m:
            actions.append({"type": "set_bantu_grid", "style": style_key, "density": 16, "bars": 4})
            break

    # open modals
    modal_map = {
        "mixer": "mixer", "bantu": "bantu", "setup": "setup", "dream": "dream",
        "history": "history", "disk": "disk_usage", "system": "system_usage",
        "plugin": "plugins", "manual": "manual",
    }
    for key, modal in modal_map.items():
        if re.search(rf"\bopen\b.*\b{key}\b|\bouvre\b.*\b{key}\b|\b{key}\b.*\b(open|ouvre)\b", m):
            actions.append({"type": "open_modal", "modal": modal})
            break

    return actions
