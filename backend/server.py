from fastapi import FastAPI, APIRouter, HTTPException
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import random
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup
    try:
        from ai import start_scheduler
        start_scheduler()
    except Exception as exc:
        logging.getLogger(__name__).warning("scheduler start failed: %s", exc)
    yield
    # Shutdown
    try:
        from ai import shutdown_scheduler
        shutdown_scheduler()
    except Exception:
        pass
    client.close()


app = FastAPI(title="Riba DAW API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ==================== MODELS ====================
class MIDINote(BaseModel):
    pitch: int
    velocity: int = 100
    start: float  # in beats
    duration: float  # in beats

class DreamRequest(BaseModel):
    prompt: str
    tempo: int = 120

class DreamResponse(BaseModel):
    id: str
    name: str
    prompt: str
    notes: List[MIDINote]
    description: str
    created_at: str

class DreamHistoryItem(BaseModel):
    id: str
    prompt: str
    name: str
    description: str
    notes: List[MIDINote]
    created_at: str

class Session(BaseModel):
    id: Optional[str] = None
    name: str
    tempo: int = 120
    master_volume: int = 80
    tracks: List[dict] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class MasteringRequest(BaseModel):
    track_descriptions: List[str] = []

class BantuGridRequest(BaseModel):
    style: str = "asiko_wisdom"
    density: int = 16
    bars: float = 4.0

class HardwareSetupRequest(BaseModel):
    default_input: str = ""
    total_inputs: int = 0
    default_output: str = ""
    total_outputs: int = 0

# ==================== HELPERS ====================
SCALES = {
    "major":      [0, 2, 4, 5, 7, 9, 11],
    "minor":      [0, 2, 3, 5, 7, 8, 10],
    "dorian":     [0, 2, 3, 5, 7, 9, 10],
    "pentatonic": [0, 2, 4, 7, 9],
    "blues":      [0, 3, 5, 6, 7, 10],
    "lydian":     [0, 2, 4, 6, 7, 9, 11],
}

def procedural_dream_notes(prompt: str) -> tuple[List[MIDINote], str, str]:
    """Fallback procedural generation when LLM unavailable / fails."""
    p = prompt.lower()
    scale_name = "minor"
    if any(w in p for w in ["happy", "joy", "bright", "upbeat", "joyeux", "heureux"]):
        scale_name = "major"
    elif any(w in p for w in ["sad", "dark", "melanchol", "triste", "sombre"]):
        scale_name = "minor"
    elif any(w in p for w in ["dream", "ethereal", "ambient", "reve", "ambiant"]):
        scale_name = "lydian"
    elif any(w in p for w in ["jazz", "blues"]):
        scale_name = "blues"
    elif any(w in p for w in ["folk", "asian", "asiatique"]):
        scale_name = "pentatonic"

    root = 60
    scale = SCALES[scale_name]
    notes: List[MIDINote] = []
    count = 24 + random.randint(0, 16)
    for i in range(count):
        deg = random.choice(scale)
        octave = random.choice([0, 0, 0, 12, -12])
        pitch = root + deg + octave
        velocity = 60 + random.randint(0, 50)
        start = i * 0.5
        dur = random.choice([0.25, 0.5, 0.5, 1.0])
        notes.append(MIDINote(pitch=pitch, velocity=velocity, start=start, duration=dur))

    name = f"Dream {scale_name.title()} {random.randint(100, 999)}"
    desc = f"Procedural {scale_name} melody, {count} notes."
    return notes, name, desc

async def generate_dream_with_llm(prompt: str, tempo: int) -> tuple[List[MIDINote], str, str]:
    """Use Emergent LLM to design a short melodic phrase."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"emergentintegrations import failed: {e}")
        return procedural_dream_notes(prompt)

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return procedural_dream_notes(prompt)

    system_msg = (
        "You are a music composer assistant for a DAW. "
        "Given a textual mood prompt, output a SHORT melody as STRICT JSON only, no prose. "
        "Schema: {\"name\": string, \"description\": string, \"notes\": "
        "[{\"pitch\": int 36-84, \"velocity\": int 1-127, \"start\": float beats, \"duration\": float beats}]}. "
        "Provide 16-32 notes, total length ~8 beats, musical (use scales). "
        "Return ONLY raw JSON, no markdown fences."
    )

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"dream-{uuid.uuid4()}",
            system_message=system_msg,
        ).with_model("openai", "gpt-5.4-mini")

        user_text = f"Mood/Prompt: {prompt}\nTempo: {tempo} BPM\nReturn the JSON now."
        resp = await chat.send_message(UserMessage(text=user_text))

        text = str(resp).strip()
        # strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip("` \n")

        data = json.loads(text)
        notes_raw = data.get("notes", [])
        notes: List[MIDINote] = []
        for n in notes_raw:
            try:
                p = int(n.get("pitch", 60))
                if p < 24 or p > 96:
                    continue
                v = int(n.get("velocity", 90))
                v = max(1, min(127, v))
                s = float(n.get("start", 0))
                d = float(n.get("duration", 0.5))
                notes.append(MIDINote(pitch=p, velocity=v, start=s, duration=d))
            except Exception:
                continue

        if not notes:
            return procedural_dream_notes(prompt)

        name = str(data.get("name") or f"Dream Track {random.randint(100, 999)}")[:60]
        desc = str(data.get("description") or "AI generated dream melody")[:300]
        return notes, name, desc
    except Exception as e:
        logger.warning(f"LLM dream gen failed: {e}; falling back to procedural")
        return procedural_dream_notes(prompt)

async def generate_mastering_with_llm(descriptions: List[str]) -> str:
    """Use LLM to produce mastering suggestions text."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise RuntimeError("no key")
        chat = LlmChat(
            api_key=api_key,
            session_id=f"master-{uuid.uuid4()}",
            system_message=(
                "You are an audio mastering engineer. Given a list of tracks in a mix, "
                "respond with concise mastering suggestions in 4 short bullet points "
                "covering: EQ, Compression, Stereo Width, Loudness target. Be practical."
            ),
        ).with_model("openai", "gpt-5.4-mini")
        tracks_text = "\n".join(f"- {d}" for d in descriptions) or "- (no tracks)"
        resp = await chat.send_message(UserMessage(text=f"Tracks in the mix:\n{tracks_text}"))
        return str(resp).strip()
    except Exception as e:
        logger.warning(f"mastering LLM failed: {e}")
        return (
            "• EQ: cut 200-400Hz mud, gentle +2dB shelf above 8kHz for air.\n"
            "• Compression: 2:1 ratio, slow attack (~30ms), release ~120ms, 2-3dB GR.\n"
            "• Stereo Width: keep <120Hz mono, widen 6-10kHz slightly.\n"
            "• Loudness: target -10 to -8 LUFS integrated for streaming."
        )

# ==================== ROUTES ====================
@api_router.get("/")
async def root():
    return {"message": "Riba DAW API", "version": "1.0"}

@api_router.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}

@api_router.post("/dream/generate", response_model=DreamResponse)
async def dream_generate(req: DreamRequest):
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    notes, name, desc = await generate_dream_with_llm(req.prompt, req.tempo)
    item_id = str(uuid.uuid4())
    created = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": item_id,
        "prompt": req.prompt,
        "name": name,
        "description": desc,
        "notes": [n.model_dump() for n in notes],
        "tempo": req.tempo,
        "created_at": created,
    }
    await db.dream_history.insert_one(doc)
    return DreamResponse(id=item_id, name=name, prompt=req.prompt,
                         notes=notes, description=desc, created_at=created)

@api_router.get("/dream/history", response_model=List[DreamHistoryItem])
async def dream_history():
    items = await db.dream_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    out: List[DreamHistoryItem] = []
    for it in items:
        notes = [MIDINote(**n) for n in it.get("notes", [])]
        out.append(DreamHistoryItem(
            id=it["id"], prompt=it["prompt"], name=it["name"],
            description=it.get("description", ""), notes=notes,
            created_at=it["created_at"],
        ))
    return out

@api_router.post("/mastering/suggest")
async def mastering_suggest(req: MasteringRequest):
    text = await generate_mastering_with_llm(req.track_descriptions)
    return {"suggestions": text}

# ====== Bantu Oral Grid — exclusive Riba quantization ======
import math

def _build_bantu_grid(style: str, density: int, bars: float):
    """Generate asymmetric quantization positions (in beats, 1 beat = quarter note)."""
    if density < 2:
        density = 2
    if density > 256:
        density = 256
    total_beats = bars * 4.0  # 4 beats per bar
    # uniform base grid
    base = [i * (total_beats / density) for i in range(density)]
    s = style.lower()

    def _apply_swing(arr, offsets):
        return [arr[i] + offsets[i % len(offsets)] for i in range(len(arr))]

    if s == "asiko_wisdom":
        # Asiko: 3rd & 7th positions skew
        out = list(base)
        for i in range(len(out)):
            if i % 3 == 0: out[i] += 0.10  # micro-anticipation (sacred swing)
            elif i % 7 == 0: out[i] -= 0.06
        description = "Asiko (sagesse): anticipation sur 3e impact, tension retardée sur 7e."
    elif s == "makossa_roots":
        swing = [0.0, 0.16, -0.08, 0.04]  # in beats
        out = _apply_swing(base, swing)
        description = "Makossa: syncope basse-pulsation, accentuation backbeat ternaire."
    elif s == "bikutsi_44":
        # Bikutsi 4/4 - 8 notes ternaires (rapide, accent ternaire)
        swing = [0.0, 0.20, 0.40, 0.0, 0.20, 0.40, 0.0, 0.20]
        out = _apply_swing(base, swing[:density % 8 or 8])
        for i in range(len(out)):
            if i % 4 == 2: out[i] += 0.08  # accent fort sur "and-of-2"
        description = "Bikutsi 4/4 (8 ternaire): pulsation rapide, accent sur le contretemps fort."
    elif s == "bikutsi_68":
        # 6/8 - groupement 2+2+2 ou 3+3
        swing = [0.0, 0.18, 0.32, 0.50, 0.66, 0.82]
        out = []
        for i in range(density):
            cycle = i % 6
            bar_idx = i // 6
            out.append((swing[cycle] + bar_idx * 1.0) * (total_beats / max(1, density / 6)))
        description = "Bikutsi 6/8: groupement ternaire, accents 1 et 4."
    elif s == "bikutsi_1224":
        # 12/24 - subdivision très fine, polyrythmie 3-contre-4
        out = []
        for i in range(density):
            beat = (i / density) * total_beats
            # polyrhythmic push every 3rd vs 4th subdivision
            if i % 3 == 0: beat -= 0.04
            if i % 4 == 0: beat += 0.05
            out.append(beat)
        description = "Bikutsi 12/24: polyrythmie 3-contre-4, micro-décalages denses."
    else:
        return None, None

    # clamp to [0, total_beats]
    out = [max(0.0, min(total_beats, round(v, 4))) for v in out]
    return out, description


@api_router.post("/quantize/bantu-grid")
async def bantu_grid(req: BantuGridRequest):
    out, desc = _build_bantu_grid(req.style, req.density, req.bars)
    if out is None:
        raise HTTPException(status_code=400, detail=f"Unknown rhythmic style: {req.style}")
    return {
        "style": req.style,
        "density": req.density,
        "bars": req.bars,
        "time_stamps_beats": out,
        "description": desc,
        "available_styles": ["asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224"],
    }


@api_router.get("/quantize/styles")
async def quantize_styles():
    return {
        "styles": [
            {"id": "asiko_wisdom",  "label": "Asiko Wisdom (Sagesse africaine)",  "family": "Africain"},
            {"id": "makossa_roots", "label": "Makossa Roots (Racines Camerounaises)", "family": "Cameroun"},
            {"id": "bikutsi_44",    "label": "Bikutsi 4/4 (8 ternaire)",          "family": "Cameroun"},
            {"id": "bikutsi_68",    "label": "Bikutsi 6/8",                       "family": "Cameroun"},
            {"id": "bikutsi_1224",  "label": "Bikutsi 12/24 (polyrythmie 3-contre-4)", "family": "Cameroun"},
        ]
    }


@api_router.post("/setup/hardware")
async def setup_hardware(req: HardwareSetupRequest):
    doc = {
        "default_input": req.default_input,
        "total_inputs": req.total_inputs,
        "default_output": req.default_output,
        "total_outputs": req.total_outputs,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.hardware_setup.update_one({"_id": "default"}, {"$set": doc}, upsert=True)
    return {"saved": True, "config": doc}


@api_router.post("/session/save")
async def session_save(session: Session):
    now = datetime.now(timezone.utc).isoformat()
    if not session.id:
        session.id = str(uuid.uuid4())
        session.created_at = now
    session.updated_at = now
    doc = session.model_dump()
    await db.sessions.update_one({"id": session.id}, {"$set": doc}, upsert=True)
    return {"id": session.id, "updated_at": session.updated_at}

@api_router.get("/session/list")
async def session_list():
    items = await db.sessions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    return items

@api_router.get("/session/{session_id}")
async def session_get(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s

@api_router.delete("/session/{session_id}")
async def session_delete(session_id: str):
    r = await db.sessions.delete_one({"id": session_id})
    return {"deleted": r.deleted_count}

app.include_router(api_router)

# === AI routes (LLM assistant + fal.ai MusicGen + Demucs stems) ===
from ai import (  # noqa: E402
    assistant_router,
    generator_router,
    genesis_router,
    music_router,
    stems_router,
    remix_router,
    reel_router,
    snippets_router,
    share_router,
    album_router,
    promo_router,
    studio_live_router,
    translate_router,
    start_scheduler,
    shutdown_scheduler,
)
api_ai = APIRouter(prefix="/api")
api_ai.include_router(assistant_router)
api_ai.include_router(generator_router)
api_ai.include_router(genesis_router)
api_ai.include_router(music_router)
api_ai.include_router(stems_router)
api_ai.include_router(remix_router)
api_ai.include_router(reel_router)
api_ai.include_router(snippets_router)
api_ai.include_router(share_router)
api_ai.include_router(album_router)
api_ai.include_router(promo_router)
api_ai.include_router(translate_router)
# Studio-Live exposes a WebSocket route at /api/ws/session/{id} + /api/sessions
api_ai.include_router(studio_live_router)
app.include_router(api_ai)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
