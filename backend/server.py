from fastapi import FastAPI, APIRouter, HTTPException
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

app = FastAPI(title="Riba DAW API")
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
