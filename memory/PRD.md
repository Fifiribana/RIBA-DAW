# Riba DAW — Product Requirements Document

## Original Problem Statement
User provided Windows C++ DAW code (Win32 + WASAPI) for an app named **Riba 12**, asked for a web version with ALL features. Later sent an extended HTML/JS reference + a new project JSON format with `id`, `name`, `type`, `instrument`, `notes`, `effects`.

## Architecture
- **Frontend**: React 19 + Tailwind, WebAudio API (per-track FX bus: EQ → Delay/Reverb → Pan → Gain), MediaRecorder, OfflineAudioContext (stems WAV export), Canvas-based waveform/VU/spectrum/playhead, Phosphor Icons.
- **Backend**: FastAPI + MongoDB (Motor) + emergentintegrations LLM (gpt-5.4-mini fallback to procedural).
- **Routing**: All backend endpoints under `/api`, frontend uses `REACT_APP_BACKEND_URL`.

## User Personas
1. **Solo musician / producer** — quick multi-track web sketchpad with AI assistance.
2. **Hobbyist songwriter** — record voice/instruments via mic and layer simple MIDI ideas.
3. **AI music explorer** — Dream Track text-to-MIDI prompts and iteration.

## Core Requirements (static)
- Multi-track audio + MIDI playback with mute/solo/volume/pan/instruments/FX
- Per-track 3-band EQ (low-shelf 200Hz, peaking 1kHz, high-shelf 5kHz)
- Per-track Reverb (convolution) + Delay (feedback) toggles
- Per-track GM 128 instrument selector (oscillator + filter + envelope)
- Microphone recording → new track
- Metronome (BPM, time signature) with visual indicator
- **Transport Loop** (L key) with auto-restart at loop end
- **Moving playhead timeline** with bar markers + bar.beat display
- **Undo / Redo** (Ctrl+Z/Y, 30-step stack)
- **Menu bar** (File/Edit/Track/Event/AudioSuite/Tools/View/Options/Help) with dropdowns
- Dream Track AI generation (LLM-backed, procedural fallback)
- Dream history (MongoDB)
- Magic12 stem separation (simulated)
- Magic12 AI mastering (LLM suggestions)
- **GM 128 Instruments dialog** with apply-to-all-MIDI
- **VST Scan** popup (cosmetic 4,833-plugin progress)
- **Plugins list modal** (curated 20 representative VSTs)
- **Mixer dialog** (vertical sliders per track + Master)
- **Stems export** (one WAV per track via OfflineAudioContext)
- MIDI ↔ Audio conversion (simulated)
- Piano roll editor (click to add/remove notes)
- Waveform thumbnail, real-time VU + spectrum analyzer
- Master volume, master VU
- Session save/load (MongoDB), JSON export, **Project JSON import** (new format)
- Keyboard shortcuts: Space, M, L, F1, 1–9, Ctrl+S/O/E/Z/Y
- Dark/Light theme toggle

## Project JSON format (importable)
```json
{
  "project": {
    "tempo": 120,
    "timeSignature": "4/4",
    "tracks": [
      {
        "id": "track_1",
        "name": "Melody",
        "type": "midi",
        "instrument": "Lead 1 (square)",
        "notes": [{ "pitch": 60, "velocity": 100, "start": 0, "duration": 0.5 }],
        "effects": ["reverb", "delay"]
      }
    ]
  }
}
```

## What's Been Implemented
### v1.0 — initial DAW
- Full WebAudio engine, multi-track UI, mic recording, metronome, Dream Track AI, save/load, theme, manual.

### v1.1 — extended features (this iteration)
- Menu bar (File/Edit/Track/Event/AudioSuite/Tools/View/Options/Help) with dropdowns
- Transport Loop button + L keyboard shortcut + loop wrap restart
- Self-animating Timeline component (raf-driven playhead, bar.beat label)
- Undo/Redo with 30-step history + Ctrl+Z/Y
- GM 128 Instruments registry with oscillator/filter/envelope presets, per-track selector, modal with apply-to-all
- VST Scan cosmetic popup (4833-plugin animation)
- Plugins modal (20 curated VST entries: Serum, Pro-Q 3, Valhalla, Ozone 11, etc.)
- Mixer modal (vertical fader per track + master)
- Stems export → real WAV file per track via OfflineAudioContext
- Per-track Reverb (convolution IR) and Delay (feedback) toggles
- Project JSON import endpoint with mapping of `instrument` name → preset index, `effects[]` → reverb/delay flags
- 7/7 backend tests pass, all new frontend flows verified by testing agent

## ⚠️ Known Limitations
- **MOCKED**: VST/AU plugin scanner & plugin loader (browsers can't load native plugins).
- **MOCKED**: Magic12 stem separation (creates fake stem tracks).
- **MOCKED**: MIDI → Audio and Audio → MIDI conversions (no real DSP/pitch detection).
- **LLM BUDGET**: Emergent universal key budget exceeded — AI features fall back to procedural. User can top up at Profile → Universal Key → Add Balance.

## Prioritized Backlog (P0 → P2)
- P1: Real audio render-to-WAV for entire mix → MP3 encoder.
- P1: Real Audio→MIDI via WebAudio pitch detection (YIN / CREPE).
- P2: Real stem separation via Spleeter-WASM.
- P2: Drag-and-drop file upload on track lane; loop region with handles.
- P2: WebMIDI input for external MIDI keyboards.

## Next Action Items
- Top up Emergent LLM key to enable real AI Dream Track / Mastering.
- Optional: implement real MP3 export and real Audio→MIDI pitch detection.
