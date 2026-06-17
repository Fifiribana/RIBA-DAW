# Riba DAW — Product Requirements Document

## Original Problem Statement
User provided Windows C++ DAW code (Win32 + WASAPI) for an app named **Riba 12** and asked for a web version with ALL features. Across iterations user extended scope to include:
- Extended HTML/JS feature set (menu bar, Loop, GM 128, VST scan, Mixer, Stems, Plugins, Undo/Redo)
- New project JSON format (`id, name, type, instrument, notes, effects`)
- **Pro Tools-inspired menu bar** with the exact JSON spec (File / Edit / Track / AudioSuite / Setup / etc.)

## Architecture
- **Frontend**: React 19 + Tailwind, WebAudio API (per-track FX bus: EQ → Reverb/Delay → Pan → Gain), MediaRecorder, OfflineAudioContext (stems + bounce mix), Canvas-based waveform/VU/spectrum/playhead, Phosphor Icons.
- **Backend**: FastAPI + MongoDB + emergentintegrations LLM (gpt-5.4-mini, procedural fallback).

## What's Been Implemented
### v1.0 — initial DAW
Multi-track audio + MIDI playback, mic recording, metronome, Dream Track AI, save/load, theme, manual.

### v1.1 — extended features
Menu bar, Loop + L shortcut, animated Timeline+playhead, Undo/Redo (Ctrl+Z/Y), GM 128 instruments, VST scan, Plugins modal, Mixer modal, Stems export (WAV), per-track Reverb + Delay, Project JSON import.

### v1.2 — Pro Tools menu (this iteration)
**Menu bar restructured to Pro Tools spec** with 9 menus (File/Edit/Track/Event/AudioSuite/Tools/View/Setup/Help) and all shortcuts displayed:

#### File
- New Session (Ctrl+N), Open Session (Ctrl+O), Save (Ctrl+S), **Save Copy In**, Import Audio (Ctrl+Shift+I), **Import Session Data**, Import Project JSON, **Bounce Mix** (Ctrl+Alt+B — real WAV via OfflineAudioContext), Export Stems, Export Session JSON

#### Edit
- Undo (Ctrl+Z), Redo (Ctrl+Y), **Cut/Copy/Paste** (Ctrl+X/C/V on selected track), **Separate Clip At Selection** (Ctrl+E — splits MIDI track at playhead into [L]/[R]), **Consolidate Clip** (deduplicates overlapping notes)

#### Track
- New MIDI Track (Ctrl+Shift+N), New Audio Track, **Group Tracks** (Ctrl+G — sync colors), **Duplicate Track**, **Freeze Track** (renders MIDI → audio buffer + ❄️ tag, saves CPU), **Commit Track** (Alt+Shift+C — permanent MIDI→audio), Delete Selected

#### AudioSuite (destructive processing on audio tracks)
- **Gain Destructive** (+4dB baked into buffer), **EQ/Filter** (3-band baked), **Reverb Process** (convolution baked), plus Magic12 Sep / Master entries

#### Setup
- **Playback Engine modal** (shows Web Audio API, real sample rate, baseLatency, outputLatency, ctx state), **I/O Setup** (mic + speakers + channels), **Preferences** (theme button, tempo, time sig, loop/metronome status, undo history depth), plus GM 128 / VST Scan / Plugins entries

#### Event
- Dream Track (AI), Dream History, Open Piano Roll

#### Tools / View / Help
- Toggle Metronome/Loop/Record, Mixer, Toggle Theme, User Manual (F1)

### Track row selection
- Clicking a track body selects it (border highlighted in track color). The selected track is the target of all Edit/Track/AudioSuite menu actions.

## Testing
- **Iteration 1 (v1.0)**: 7/7 backend, 100% frontend ✅
- **Iteration 2 (v1.1)**: all new features verified ✅
- **Iteration 3 (v1.2)**: Pro Tools menu structure 100% ✅ (with 1 bug found & fixed: Timeline.onPositionChange wiring)
- **Iteration 4 (regression for fix)**: Separate Clip verified ✅

## ⚠️ Known Limitations
- **MOCKED**: VST/AU plugin loader (browsers can't load native plugins).
- **MOCKED**: Magic12 stem separation (creates fake stems).
- **MOCKED**: MIDI→Audio / Audio→MIDI conversions (no real DSP).
- **LLM BUDGET EXCEEDED**: Dream/Mastering fall back to procedural. Top up at Profile → Universal Key → Add Balance.

## Prioritized Backlog
- **P1**: Native desktop build via Electron / Tauri with file system & menu native.
- **P1**: PWA manifest for "Install Riba" from Chrome/Edge.
- **P1**: Real MP3 export (lamejs).
- **P2**: WebMIDI input for external MIDI keyboards.
- **P2**: Real Audio→MIDI via CREPE/YIN pitch detection.
- **P2**: Spleeter-WASM for real stem separation.

## Next Action Items
- (User asked about desktop build) — possible next: ship PWA manifest then Electron packaging.
- Top up Emergent LLM key.
