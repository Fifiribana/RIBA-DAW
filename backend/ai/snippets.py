"""
RIBA Reel Snippet Picker — automatic best-of analysis for the Bantu Reel.

Given a mixdown WAV longer than the desired reel window (default 30s), this
module scans the audio in three complementary ways and proposes 3 candidate
start offsets so the user can preview & pick the most viral excerpt:

  • peak_energy : sliding-window mean RMS → maximum overall loudness.
  • bantu_drop  : maximum positive *delta* of low-band (<250 Hz) energy across
                  windows — proxy for "when the deep bantu drum / bantu_groove
                  enters the mix".
  • main_hook   : weighted blend of mid-band (200-3000 Hz, vocal & lead) and
                  low-band (<250 Hz, groove) energies — the most "viral" mix.

Endpoint :
    POST /api/ai/reel-snippets
        multipart : file (WAV/MP3), window_sec=30
    returns      : { duration, sample_rate, candidates:[…] }
"""
from __future__ import annotations

import io
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Dict, List

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from scipy.signal import butter, sosfiltfilt

router = APIRouter(prefix="/ai", tags=["ai-snippets"])
log = logging.getLogger("riba.snippets")

CHUNK_SEC = 1.0      # RMS analysis grid (1 envelope point per second)
MIN_WINDOW = 5       # never propose windows shorter than 5 s


def _load_mono(in_path: Path) -> tuple[np.ndarray, int]:
    """Read audio, downmix to mono float32."""
    data, sr = sf.read(str(in_path), always_2d=True, dtype="float32")
    mono = data.mean(axis=1)
    return mono, sr


def _bandpass_envelope(mono: np.ndarray, sr: int, lo: float, hi: float) -> np.ndarray:
    """Return per-chunk RMS energy in the [lo, hi] Hz band."""
    nyq = 0.5 * sr
    lo_w = max(1e-4, min(0.999, lo / nyq))
    hi_w = max(lo_w + 1e-4, min(0.9999, hi / nyq))
    sos = butter(4, [lo_w, hi_w], btype="bandpass", output="sos")
    filtered = sosfiltfilt(sos, mono)
    chunk = int(CHUNK_SEC * sr)
    n_chunks = len(filtered) // chunk
    if n_chunks <= 0:
        return np.zeros(1, dtype=np.float32)
    trimmed = filtered[: n_chunks * chunk]
    rms = np.sqrt(np.mean(trimmed.reshape(n_chunks, chunk) ** 2, axis=1) + 1e-12)
    return rms.astype(np.float32)


def _wide_rms(mono: np.ndarray, sr: int) -> np.ndarray:
    chunk = int(CHUNK_SEC * sr)
    n_chunks = len(mono) // chunk
    if n_chunks <= 0:
        return np.zeros(1, dtype=np.float32)
    trimmed = mono[: n_chunks * chunk]
    rms = np.sqrt(np.mean(trimmed.reshape(n_chunks, chunk) ** 2, axis=1) + 1e-12)
    return rms.astype(np.float32)


def _moving_window_score(env: np.ndarray, win: int) -> np.ndarray:
    """Cumulative sum trick: mean energy over each sliding window of size `win` (in chunks)."""
    if len(env) <= win:
        return np.array([env.mean()], dtype=np.float32)
    cs = np.cumsum(np.concatenate([[0.0], env]))
    sums = cs[win:] - cs[:-win]
    return (sums / win).astype(np.float32)


def _argmax_with_gap(arr: np.ndarray, exclude_ranges: List[tuple[int, int]]) -> int:
    """argmax avoiding overlapping with already-selected ranges (in chunk units)."""
    a = arr.copy()
    for s, e in exclude_ranges:
        a[max(0, s): min(len(a), e)] = -np.inf
    return int(np.argmax(a))


def analyze_snippets(in_path: Path, window_sec: int) -> dict:
    mono, sr = _load_mono(in_path)
    total_sec = len(mono) / sr
    win = max(MIN_WINDOW, int(window_sec))

    if total_sec <= win + 1.0:
        # too short → only one possible snippet : 0
        return {
            "duration": round(total_sec, 2),
            "sample_rate": sr,
            "window_sec": win,
            "candidates": [
                {"name": "full_track", "label": "Full track (too short for picking)",
                 "start_sec": 0.0, "score": 1.0}
            ],
        }

    win_chunks = max(1, int(win / CHUNK_SEC))

    # Band envelopes
    low  = _bandpass_envelope(mono, sr, 30, 250)     # bantu drum / sub
    mid  = _bandpass_envelope(mono, sr, 200, 3000)   # vocals + lead
    wide = _wide_rms(mono, sr)

    # Sliding-window scores
    s_peak = _moving_window_score(wide, win_chunks)

    # Bantu drop : the biggest *increase* in low-band energy from "pre" to "current".
    # We compare the mean low-band over the previous `lookback_chunks` with the
    # current window. Result is highest where the drop just hit.
    lookback = max(2, win_chunks // 2)
    low_prev = _moving_window_score(low, lookback)        # window=lookback
    low_now  = _moving_window_score(low, win_chunks)       # window=win
    # align: at index i of `low_now`, the previous window is low_prev[max(0, i - lookback)]
    drop = np.zeros_like(low_now)
    for i in range(len(low_now)):
        prev_idx = max(0, i - lookback)
        prev_val = float(low_prev[min(prev_idx, len(low_prev) - 1)])
        drop[i] = float(low_now[i]) - 0.85 * prev_val  # weighted delta

    # Main hook : mid-band has biggest weight, low-band fills out the groove.
    mid_now = _moving_window_score(mid, win_chunks)
    n = min(len(mid_now), len(low_now), len(s_peak))
    mid_now, low_now_t, s_peak_t, drop_t = mid_now[:n], low_now[:n], s_peak[:n], drop[:n]
    hook = 0.65 * mid_now + 0.35 * low_now_t

    # Pick 3 candidates with anti-overlap (each pick blocks ±win/2 around itself)
    radius = max(1, win_chunks // 2)
    excludes: List[tuple[int, int]] = []
    candidates: List[Dict] = []

    def _push(name: str, label: str, idx: int, score_arr: np.ndarray):
        start_sec = round(idx * CHUNK_SEC, 2)
        score = float(score_arr[idx])
        candidates.append({
            "name": name,
            "label": label,
            "start_sec": start_sec,
            "score": round(score, 5),
        })
        excludes.append((idx - radius, idx + radius))

    idx_peak = _argmax_with_gap(s_peak_t, excludes)
    _push("peak_energy", "Peak Energy", idx_peak, s_peak_t)

    idx_drop = _argmax_with_gap(drop_t, excludes)
    _push("bantu_drop", "Bantu Drop", idx_drop, drop_t)

    idx_hook = _argmax_with_gap(hook, excludes)
    _push("main_hook", "Main Hook", idx_hook, hook)

    # Normalise scores 0-1 for the UI per-row scale.
    max_score = max(c["score"] for c in candidates) or 1.0
    for c in candidates:
        c["score_norm"] = round(c["score"] / max_score, 4)

    # Clamp start_sec so window stays in bounds
    max_start = max(0.0, total_sec - win)
    for c in candidates:
        c["start_sec"] = round(min(c["start_sec"], max_start), 2)

    return {
        "duration":    round(total_sec, 2),
        "sample_rate": sr,
        "window_sec":  win,
        "candidates":  candidates,
    }


@router.post("/reel-snippets")
async def reel_snippets(
    file: UploadFile = File(...),
    window_sec: int = Form(30),
):
    if window_sec < 5 or window_sec > 120:
        raise HTTPException(400, "window_sec must be between 5 and 120")

    tmp_dir = Path(tempfile.mkdtemp(prefix="riba-snip-"))
    in_path = tmp_dir / f"in-{uuid.uuid4().hex}.wav"
    try:
        data = await file.read()
        if not data:
            raise HTTPException(400, "Uploaded file is empty.")
        in_path.write_bytes(data)
        try:
            return analyze_snippets(in_path, window_sec)
        except sf.SoundFileError as exc:
            raise HTTPException(400, f"Invalid audio file: {exc}") from exc
        except Exception as exc:
            log.exception("snippet analysis failed")
            raise HTTPException(500, f"snippet analysis failed: {exc}") from exc
    finally:
        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass
