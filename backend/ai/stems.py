"""
RIBA stem separation via Demucs (Hybrid Transformer model, open-source).
POST /api/ai/separate-stems
    multipart form-data: file=<audio>
    OR  json { "audio_url": "..." }
Returns 4 stems (vocals/drums/bass/other) as base64 WAV blobs.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/ai", tags=["ai-stems"])
log = logging.getLogger("riba.stems")

# Lazy import — Demucs + torch is heavy (~2 GB), only loaded on first use.
_demucs_separator = None


def _get_separator():
    """Lazy-load Demucs htdemucs model + return (model, device)."""
    global _demucs_separator
    if _demucs_separator is not None:
        return _demucs_separator
    try:
        import torch  # type: ignore
        from demucs.pretrained import get_model  # type: ignore
    except ImportError as exc:
        raise HTTPException(
            503,
            detail={
                "code": "DEMUCS_NOT_INSTALLED",
                "message": f"Demucs not installed: {exc}. Run `pip install demucs torch torchaudio`.",
            },
        ) from exc

    log.info("Loading Demucs model htdemucs (first run downloads ~80 MB)...")
    model = get_model("htdemucs")
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    log.info("Demucs ready on %s. sources=%s", device, model.sources)
    _demucs_separator = (model, device)
    return _demucs_separator


def _separate_file(in_path: Path) -> dict[str, bytes]:
    """Run Demucs and return {stem_name: wav_bytes}."""
    try:
        import torch  # type: ignore
        import torchaudio  # type: ignore
        import soundfile as sf  # type: ignore
        from demucs.apply import apply_model  # type: ignore
        from demucs.audio import convert_audio  # type: ignore
    except ImportError as exc:
        raise HTTPException(503, f"torchaudio/soundfile not installed: {exc}") from exc

    model, device = _get_separator()
    wav, sr = torchaudio.load(str(in_path))
    wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (ref.std() + 1e-8)
    with torch.no_grad():
        sources = apply_model(
            model, wav[None].to(device),
            split=True, overlap=0.25, progress=False
        )[0]
    sources = sources * (ref.std() + 1e-8) + ref.mean()

    out: dict[str, bytes] = {}
    for name, tensor in zip(model.sources, sources):
        buf = io.BytesIO()
        # tensor shape (channels, samples) → soundfile wants (samples, channels)
        sf.write(buf, tensor.cpu().numpy().T, model.samplerate, subtype="PCM_16", format="WAV")
        out[name] = buf.getvalue()
    return out


@router.get("/stems-status")
def stems_status():
    """Probe for the UI to know whether real Demucs is available."""
    try:
        import demucs  # type: ignore  # noqa: F401
        import torch  # type: ignore   # noqa: F401
        ready = True
        msg = "Demucs ready"
    except ImportError as exc:
        ready = False
        msg = str(exc)
    return {"enabled": ready, "provider": "demucs/htdemucs" if ready else None, "detail": msg}


@router.post("/separate-stems")
async def separate_stems(
    file: UploadFile | None = File(None),
    audio_url: str | None = Form(None),
):
    if file is None and not audio_url:
        raise HTTPException(400, "Provide either a `file` upload or an `audio_url` field.")

    tmp_dir = Path(tempfile.mkdtemp(prefix="riba-demucs-"))
    in_path = tmp_dir / f"in-{uuid.uuid4().hex}.wav"

    try:
        if file is not None:
            data = await file.read()
            in_path.write_bytes(data)
        else:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(audio_url)
                resp.raise_for_status()
                in_path.write_bytes(resp.content)

        stems = _separate_file(in_path)
        return {
            "id": str(uuid.uuid4()),
            "source": file.filename if file else audio_url,
            "stems": {
                name: {
                    "name": name,
                    "wav_base64": base64.b64encode(blob).decode("ascii"),
                    "bytes": len(blob),
                }
                for name, blob in stems.items()
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("stem separation failed")
        raise HTTPException(500, f"stem separation failed: {exc}") from exc
    finally:
        # cleanup temp
        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass
