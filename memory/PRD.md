# Riba DAW — Product Requirements Document

## Original Problem Statement
User provided Windows C++ DAW code (Win32 + WASAPI) for an app named **Riba 12** and asked to build a web version with ALL the listed features. User confirmed: "version web avec toute ces fonctionalites decritent" and accepted Emergent LLM key for AI features plus a distinctive creative design.

## Architecture
- **Frontend**: React 19 + Tailwind, WebAudio API, MediaRecorder, Canvas-based waveform/VU/spectrum, Phosphor Icons.
- **Backend**: FastAPI + MongoDB (Motor) + emergentintegrations LLM (OpenAI gpt-5.4-mini fallback to procedural).
- **Routing**: All backend endpoints under `/api`, frontend uses `REACT_APP_BACKEND_URL`.

## User Personas
1. **Solo musician / producer** — wants a quick multi-track web sketchpad with AI assistance.
2. **Hobbyist songwriter** — wants to record voice/instruments via mic and layer simple MIDI ideas.
3. **AI music explorer** — uses Dream Track to generate prompts → MIDI melodies and iterate.

## Core Requirements (static)
- Multi-track audio + MIDI playback with mute/solo/volume/pan
- Per-track 3-band EQ (low-shelf 200Hz, peaking 1kHz, high-shelf 5kHz)
- Microphone recording → new track
- Metronome (BPM 60–200, time signature 2/4/3/4/4/4/6/8) with visual indicator
- Dream Track AI generation (text prompt → MIDI notes, LLM-backed, procedural fallback)
- Dream history (persisted in MongoDB)
- Magic12 stem separation (simulated)
- Magic12 AI mastering (LLM suggestions)
- MIDI ↔ Audio conversion (simulated)
- Piano roll editor (click to add/remove notes)
- Waveform thumbnail, real-time VU + spectrum analyzer
- Master volume, master VU
- Session save/load (MongoDB) and JSON export
- Keyboard shortcuts: Space, M, F1, 1–9, Ctrl+S/O/E
- Dark/Light theme toggle

## What's Been Implemented (Jan 2026 — v1.0)
- ✅ Complete WebAudio engine (`/app/frontend/src/audio/engine.js`)
- ✅ Main DAW UI with top bar, left toolbar, track list, right inspector, status bar
- ✅ TrackRow with type tag, waveform, VU, EQ + volume + pan controls
- ✅ Piano roll modal (canvas, click to add/remove notes, C2–C6 × 16 beats)
- ✅ Dream Track dialog with prompt + presets + progress bar
- ✅ Dream history modal with reload-to-project
- ✅ Magic12 separation/mastering, MIDI↔Audio conversion (simulated)
- ✅ Mic recording via MediaRecorder → new audio track
- ✅ Backend endpoints: `/api/dream/generate`, `/api/dream/history`, `/api/mastering/suggest`, `/api/session/save|list|{id}|DELETE`, `/api/health`
- ✅ Emergent LLM integration (gpt-5.4-mini) with procedural fallback
- ✅ Theme toggle, keyboard shortcuts, session JSON export
- ✅ 7/7 backend tests pass, 100% frontend flows verified by testing agent

## ⚠️ Known Limitations
- **MOCKED**: Magic12 stem separation creates 4 fake stem tracks without real DSP separation.
- **MOCKED**: MIDI → Audio and Audio → MIDI are simulated (no real pitch detection / rendering).
- **MOCKED**: "Export" produces a JSON session file, not MP3.
- **LLM BUDGET**: Emergent universal key budget is currently exceeded. AI calls fall back to procedural generation. User can top up at Profile → Universal Key → Add Balance.

## Prioritized Backlog (P0 → P2)
- P1: Real audio render-to-WAV via OfflineAudioContext + MP3 encoder (lamejs) for true MP3 export.
- P1: Real Audio→MIDI via WebAudio pitch detection (YIN / Crepe.js).
- P2: Real stem separation via Spleeter-WASM or server-side model.
- P2: Split Daw.jsx into smaller subcomponents (transport, sidebar, inspector).
- P2: Drag-and-drop file upload on track lane.
- P2: Loop region + bar/beat ruler with playhead.

## Next Action Items
- Top up Emergent LLM key to enable real AI Dream Track and Mastering suggestions.
- Optional: connect real audio rendering for export to MP3/WAV.
