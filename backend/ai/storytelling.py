"""
RIBA Bantu Storytelling — épopée Mvett pilotée par Claude.

Génère une structure narrative en 4 chapitres (intro / défi / combat / sagesse)
avec marqueurs de timeline, hints d'arrangement (solo_drum, swing_accel, etc.),
recommandation de style Bantu, courbe tempo et courbe swing pré-calculées
prêtes à être appliquées au moteur audio.

Endpoints
    GET  /api/ai/storytelling-status   → health probe
    POST /api/ai/storytelling          → génère le récit + l'arrangement
"""
from __future__ import annotations

import json
import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, conint

router = APIRouter(prefix="/ai", tags=["ai-storytelling"])

# Structure traditionnelle Mvett — 4 chapitres canoniques
CHAPTER_SLUGS = ["intro", "defi", "combat", "sagesse"]
CHAPTER_LABELS = {
    "intro":   "Introduction · Généalogie",
    "defi":    "Défi · L'appel",
    "combat":  "Combat éthique",
    "sagesse": "Sagesse finale",
}
ALLOWED_HINTS = {
    "solo_drum", "swing_accel", "swing_decel", "vocal_chant",
    "polyrhythm_drop", "tempo_climb", "tempo_release", "silence_break",
}
ALLOWED_BANTU = {
    "asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224",
}
SUPPORTED_LANGS = {"fr", "en", "es", "pt", "sw"}


class StorytellingRequest(BaseModel):
    theme: str = Field(..., min_length=2, max_length=400,
                        description="Thème ou proverbe initial (ex. 'la sagesse du baobab').")
    structure: str = Field("mvett", description="Structure narrative ('mvett' ou 'conte').")
    language: str = Field("fr", description="Langue du récit (fr|en|es|pt|sw).")
    base_tempo: conint(ge=40, le=240) = Field(120, description="Tempo de départ.")  # type: ignore[valid-type]
    total_bars: conint(ge=8, le=128) = Field(32, description="Nombre total de mesures.")  # type: ignore[valid-type]


def _normalize_lang(lang: str) -> str:
    lang = (lang or "fr").lower()[:2]
    return lang if lang in SUPPORTED_LANGS else "fr"


def _system_prompt(lang: str) -> str:
    return (
        "You are a master Bantu storyteller producing an arrangement plan for the RIBA DAW.\n"
        "Given a theme/proverb, output a 4-chapter epic following Mvett tradition :\n"
        "  1. intro    — genealogy, lineage, calm exposition\n"
        "  2. defi    — the challenge / call to action\n"
        "  3. combat  — ethical combat, polyrhythmic climax\n"
        "  4. sagesse — wisdom resolution, slow release\n\n"
        f"All prose / lyrics MUST be written in language code '{lang}'.\n\n"
        "Return ONLY a strict JSON object — no fences, no commentary — with this schema :\n"
        "{\n"
        '  "title":              "<3-7 word evocative title in target language>",\n'
        '  "bantu_style":        "<asiko_wisdom|makossa_roots|bikutsi_44|bikutsi_68|bikutsi_1224>",\n'
        '  "chapters": [\n'
        "    {\n"
        '      "slug":             "<intro|defi|combat|sagesse>",\n'
        '      "marker_label":     "<2-5 word marker in target language>",\n'
        '      "bar_start":        <int>,    "bar_end": <int>,\n'
        '      "tempo_target":     <int, 40..240>,\n'
        '      "swing_intensity":  <float, 0..1>,\n'
        '      "arrangement_hint": "<solo_drum|swing_accel|swing_decel|vocal_chant|polyrhythm_drop|tempo_climb|tempo_release|silence_break>",\n'
        '      "narration":        "<1-2 evocative sentences>"\n'
        "    },\n"
        "    ... (4 entries, ALWAYS in order intro→defi→combat→sagesse, bars NON-overlapping covering 1..total_bars)\n"
        "  ],\n"
        '  "lyrics": [\n'
        '    "<line 1 with proverb feel>", ... (8 to 16 short lines, target language)\n'
        "  ]\n"
        "}\n\n"
        "Constraints :\n"
        "- chapters MUST cover the bars 1..total_bars contiguously and in order (no gaps, no overlap).\n"
        "- tempo_target follows an arc : intro≈base_tempo, defi slightly higher, combat highest (+10..+30 BPM), sagesse releases back near base_tempo.\n"
        "- swing_intensity follows the drama : low in intro (0.2..0.4), peaks in combat (0.7..0.95), back to mid (0.4..0.6) in sagesse.\n"
        "- arrangement_hint MUST be from the allowed list.\n"
        "- lyrics MUST sound like Bantu epic poetry, short rhythmic lines.\n"
    )


def _local_fallback(req: StorytellingRequest) -> dict:
    """Deterministic fallback when the LLM is unreachable.

    Produces a 4-chapter arrangement that still ramps tempo and swing through
    the canonical Mvett arc, so the audio impact path stays meaningful.
    """
    lang = _normalize_lang(req.language)
    total = req.total_bars
    # Split 32 bars → [8, 8, 8, 8]; generalise on any total_bars
    span = max(1, total // 4)
    bounds = []
    cursor = 1
    for i in range(4):
        end = total if i == 3 else cursor + span - 1
        bounds.append((cursor, end))
        cursor = end + 1
    base = req.base_tempo
    arc = [(base, 0.30), (base + 8, 0.55), (base + 20, 0.85), (base + 4, 0.50)]
    hints = ["vocal_chant", "tempo_climb", "polyrhythm_drop", "tempo_release"]
    labels_by_lang = {
        "fr": ["Lignée", "Appel du défi", "Combat sacré", "Sagesse finale"],
        "en": ["Lineage", "Call to challenge", "Sacred battle", "Final wisdom"],
        "es": ["Linaje", "Llamado al desafío", "Batalla sagrada", "Sabiduría final"],
        "pt": ["Linhagem", "Chamado ao desafio", "Batalha sagrada", "Sabedoria final"],
        "sw": ["Ukoo", "Mwito wa changamoto", "Vita takatifu", "Hekima ya mwisho"],
    }
    labels = labels_by_lang.get(lang, labels_by_lang["fr"])
    narrations = {
        "fr": [
            "Les ancêtres se rassemblent sous le baobab millénaire.",
            "L'écho du tambour appelle les courageux au combat.",
            "La polyrythmie embrase la nuit, les âmes dansent.",
            "Le sage parle, le silence apprend.",
        ],
        "en": [
            "The ancestors gather under the millennial baobab.",
            "The drum's echo summons the brave to battle.",
            "Polyrhythms ignite the night, souls begin to dance.",
            "The elder speaks, silence learns.",
        ],
        "es": [
            "Los ancestros se reúnen bajo el baobab milenario.",
            "El eco del tambor convoca a los valientes al combate.",
            "Las polirritmias encienden la noche, las almas danzan.",
            "El anciano habla, el silencio aprende.",
        ],
        "pt": [
            "Os ancestrais se reúnem sob o baobá milenar.",
            "O eco do tambor convoca os bravos para o combate.",
            "As polirritmias incendeiam a noite, as almas dançam.",
            "O ancião fala, o silêncio aprende.",
        ],
        "sw": [
            "Mababu wanakusanyika chini ya mbuyu wa miaka elfu.",
            "Mwangwi wa ngoma unawaita mashujaa vitani.",
            "Midundo mingi inawasha usiku, roho zinacheza.",
            "Mzee anaongea, ukimya unajifunza.",
        ],
    }
    nar = narrations.get(lang, narrations["fr"])
    chapters = []
    for i, slug in enumerate(CHAPTER_SLUGS):
        tempo, swing = arc[i]
        chapters.append({
            "slug": slug,
            "marker_label": labels[i],
            "bar_start": bounds[i][0],
            "bar_end": bounds[i][1],
            "tempo_target": int(tempo),
            "swing_intensity": float(swing),
            "arrangement_hint": hints[i],
            "narration": nar[i],
        })
    titles = {
        "fr": "L'écho du baobab",
        "en": "Echo of the Baobab",
        "es": "Eco del Baobab",
        "pt": "Eco do Baobá",
        "sw": "Mwangwi wa Mbuyu",
    }
    lyrics_by_lang = {
        "fr": [
            "Sous le baobab, la terre se souvient",
            "Le tambour parle, l'ancêtre revient",
            "Marche, marche, l'épreuve t'appelle",
            "Le feu danse, l'âme s'éveille",
            "Combat sans haine, force sans peur",
            "La nuit s'embrase, le ciel chante en chœur",
            "La sagesse n'est pas dans le bruit",
            "Mais dans le silence qui suit",
        ],
        "en": [
            "Beneath the baobab, the earth remembers",
            "The drum speaks, the ancestor returns",
            "March, march, the trial is calling",
            "The fire dances, the soul awakens",
            "Fight without hate, strength without fear",
            "The night ignites, the sky sings in chorus",
            "Wisdom lives not in the noise",
            "But in the silence that follows",
        ],
        "es": [
            "Bajo el baobab, la tierra recuerda",
            "El tambor habla, el ancestro regresa",
            "Marcha, marcha, la prueba te llama",
            "El fuego danza, el alma despierta",
            "Lucha sin odio, fuerza sin miedo",
            "La noche se enciende, el cielo canta a coro",
            "La sabiduría no vive en el ruido",
            "Sino en el silencio que sigue",
        ],
        "pt": [
            "Sob o baobá, a terra se lembra",
            "O tambor fala, o ancestral retorna",
            "Marcha, marcha, a provação te chama",
            "O fogo dança, a alma desperta",
            "Lute sem ódio, força sem medo",
            "A noite se acende, o céu canta em coro",
            "A sabedoria não vive no ruído",
            "Mas no silêncio que se segue",
        ],
        "sw": [
            "Chini ya mbuyu, dunia inakumbuka",
            "Ngoma inazungumza, babu anarudi",
            "Tembea, tembea, jaribu linakuita",
            "Moto unacheza, roho inaamka",
            "Pigana bila chuki, nguvu bila woga",
            "Usiku unawaka, mbingu inaimba kwa pamoja",
            "Hekima haiishi katika kelele",
            "Bali katika ukimya unaofuata",
        ],
    }
    return {
        "title": titles.get(lang, titles["fr"]),
        "bantu_style": "bikutsi_68",
        "chapters": chapters,
        "lyrics": lyrics_by_lang.get(lang, lyrics_by_lang["fr"]),
        "fallback": True,
    }


def _coerce_and_validate(raw: dict, req: StorytellingRequest) -> dict:
    """Sanitize the LLM output to keep the contract strict.

    Anything missing/invalid falls back to the deterministic version so the
    frontend always receives a usable arrangement.
    """
    if not isinstance(raw, dict):
        return _local_fallback(req)
    chapters_in = raw.get("chapters")
    if not isinstance(chapters_in, list) or len(chapters_in) != 4:
        return _local_fallback(req)
    out_chapters = []
    fb = _local_fallback(req)
    fb_chapters = fb["chapters"]
    for i, slug in enumerate(CHAPTER_SLUGS):
        src = next((c for c in chapters_in if isinstance(c, dict) and c.get("slug") == slug),
                    chapters_in[i] if i < len(chapters_in) else {}) or {}
        # Force ordering / fill missing with deterministic fallback
        def _take(key, default, caster=None):
            v = src.get(key, default)
            if caster:
                try:
                    v = caster(v)
                except Exception:
                    v = default
            return v
        chap = {
            "slug": slug,
            "marker_label": str(src.get("marker_label") or fb_chapters[i]["marker_label"])[:80],
            "bar_start": _take("bar_start", fb_chapters[i]["bar_start"], int),
            "bar_end":   _take("bar_end",   fb_chapters[i]["bar_end"],   int),
            "tempo_target": max(40, min(240, _take("tempo_target", fb_chapters[i]["tempo_target"], int))),
            "swing_intensity": max(0.0, min(1.0, _take("swing_intensity", fb_chapters[i]["swing_intensity"], float))),
            "arrangement_hint": src.get("arrangement_hint") if src.get("arrangement_hint") in ALLOWED_HINTS
                                else fb_chapters[i]["arrangement_hint"],
            "narration": str(src.get("narration") or fb_chapters[i]["narration"])[:280],
        }
        out_chapters.append(chap)

    # Ensure bars are contiguous and cover 1..total_bars
    out_chapters[0]["bar_start"] = 1
    out_chapters[-1]["bar_end"] = req.total_bars
    for i in range(1, 4):
        if out_chapters[i]["bar_start"] != out_chapters[i - 1]["bar_end"] + 1:
            out_chapters[i]["bar_start"] = out_chapters[i - 1]["bar_end"] + 1
        if out_chapters[i]["bar_end"] < out_chapters[i]["bar_start"]:
            out_chapters[i]["bar_end"] = min(req.total_bars, out_chapters[i]["bar_start"] + 1)

    lyrics_in = raw.get("lyrics")
    if not isinstance(lyrics_in, list) or not lyrics_in:
        lyrics = fb["lyrics"]
    else:
        lyrics = [str(l)[:140] for l in lyrics_in if isinstance(l, (str, int, float))][:16]
        if len(lyrics) < 4:
            lyrics = fb["lyrics"]

    bantu_style = raw.get("bantu_style")
    if bantu_style not in ALLOWED_BANTU:
        bantu_style = fb["bantu_style"]

    title = str(raw.get("title") or fb["title"])[:80]
    return {
        "title": title,
        "bantu_style": bantu_style,
        "chapters": out_chapters,
        "lyrics": lyrics,
        "fallback": False,
    }


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.lstrip().lower().startswith("json"):
            text = text.split("\n", 1)[1] if "\n" in text else text
    # Be lenient — find first { and last }
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    return m.group(0) if m else text.strip()


@router.get("/storytelling-status")
async def storytelling_status():
    return {
        "enabled": bool(os.getenv("EMERGENT_LLM_KEY")),
        "provider": "anthropic/claude-sonnet-4-6" if os.getenv("EMERGENT_LLM_KEY") else None,
        "structures": ["mvett", "conte"],
        "languages": sorted(SUPPORTED_LANGS),
        "chapter_slugs": CHAPTER_SLUGS,
        "arrangement_hints": sorted(ALLOWED_HINTS),
        "bantu_styles": sorted(ALLOWED_BANTU),
    }


@router.post("/storytelling")
async def storytelling(req: StorytellingRequest):
    lang = _normalize_lang(req.language)
    req = req.model_copy(update={"language": lang})
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        out = _local_fallback(req)
        out["fallback_reason"] = "EMERGENT_LLM_KEY not configured"
        return out

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError as exc:
        raise HTTPException(500, f"emergentintegrations not installed: {exc}") from exc

    user_payload = (
        f"Theme/proverb: {req.theme!r}\n"
        f"Structure: {req.structure}\n"
        f"Target language: {lang}\n"
        f"Base tempo: {req.base_tempo} BPM\n"
        f"Total bars: {req.total_bars}\n"
        "Generate the strict JSON arrangement now."
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=str(uuid.uuid4()),
        system_message=_system_prompt(lang),
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        reply = await chat.send_message(UserMessage(text=user_payload))
    except Exception as exc:  # noqa: BLE001 — graceful fallback on any LLM failure
        out = _local_fallback(req)
        out["fallback_reason"] = type(exc).__name__
        return out

    text = _strip_fences(str(reply))
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        out = _local_fallback(req)
        out["fallback_reason"] = "json_decode"
        return out

    return _coerce_and_validate(parsed, req)
