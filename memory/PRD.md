# Riba DAW — Product Requirements Document

## Original Problem Statement
User asked for web DAW called Riba, extended over iterations with: full feature set, extended HTML/JS features, Project JSON format, Pro Tools menu structure, and now **Pro Tools MixerStrip + TransportBar refinements, audio device enumeration, BPM auto-detect, and a unique African Bantu Oral Grid quantization system (Bikutsi 4/4 ternaire / 6/8 / 12/24, Makossa, Asiko)**.

## Architecture
- **Frontend**: React 19 + Tailwind, WebAudio API, MediaRecorder, OfflineAudioContext, Canvas viz, Phosphor Icons.
- **Backend**: FastAPI + MongoDB + emergentintegrations LLM.

## What's Been Implemented

### v1.0 → v1.2 (previous iterations)
- Multi-track audio + MIDI, mic recording, metronome with TS, Dream Track AI (LLM), session save/load, theme.
- Menu bar Pro Tools (File / Edit / Track / Event / AudioSuite / Tools / View / Setup / Help) with shortcuts.
- Loop button + L shortcut, Timeline + moving playhead, Undo/Redo (Ctrl+Z/Y, 30-step).
- GM 128 instruments with synth presets, per-track Reverb + Delay, 3-band EQ.
- Mixer modal, Stems export (real WAV via OfflineAudioContext), VST scan / Plugins modal.
- Bounce Mix (real WAV mixdown), Freeze ❄️ / Commit / Duplicate / Group / Cut-Copy-Paste / Separate Clip / Consolidate.
- AudioSuite destructive Gain / EQ / Reverb on audio buffer.
- Project JSON import (`{project:{tempo, timeSignature, tracks:[{id,name,type,instrument,notes,effects}]}}`).

### v1.3 (this iteration)
- **Auto-BPM detect** : per audio track, button `BPM` analyses onset peaks and proposes to set as project tempo.
- **Audio device enumeration** : Setup → Playback Engine now lists detected `audioinput` + `audiooutput` devices (after `getUserMedia` permission). Backend stores the selection in `/api/setup/hardware`.
- **🌍 Bantu Oral Grid (innovation Riba exclusive)** : 5 styles available, applied as asymmetric MIDI quantization:
  - `asiko_wisdom` (anticipation sur 3e impact, retard sur 7e)
  - `makossa_roots` (syncope basse-pulsation)
  - `bikutsi_44` — **Bikutsi 4/4, 8 ternaire**
  - `bikutsi_68` — **Bikutsi 6/8**
  - `bikutsi_1224` — **Bikutsi 12/24 polyrythmie 3-contre-4**
  - Endpoints: `POST /api/quantize/bantu-grid` (returns `time_stamps_beats`), `GET /api/quantize/styles`
  - UI: Event menu → "Bantu Grid Quantize... 🌍" → modal with style/density/bars → "Appliquer la grille" snaps the selected MIDI track's notes to the asymmetric grid.
- **TransportBar/MixerStrip** : kept the existing implementations (already had vertical fader, dB display, mute/solo, master strip in Mixer modal).

### v1.6 (iteration 8 - Feb 2026) — BANTU VISUAL INNOVATION 🌍
- **🎨 Markers Bantu Grid sur Timeline** :
  - Lignes verticales asymétriques en arrière-plan (opacity 0.35, box-shadow lueur)
  - Couleur dynamique selon le style actif (Asiko #A820FF, Makossa #D946EF, Bikutsi 4/4 #F472B6, 6/8 #FB7185, 12/24 #F59E0B)
  - Auto-révélés après `applyBantuGrid` ; toggle manuel via bouton "🌍 Grid" dans la TopBar
- **🎬 BantuTeaser animé dans MenuBar** :
  - Canvas 60×16 px à côté de "Quantize to Bantu Oral Grid" du menu Event
  - Animation pulse 200ms en boucle, cycle des 5 styles toutes les 1.4s
  - Aperçu visuel des micro-décalages avant même de cliquer
- **♻️ Nouveau module** `daw/bantuGrid.js` : portage JS du `_build_bantu_grid` Python.
  - Parité math byte-identique vérifiée (asiko_wisdom + bikutsi_44 testés)
  - Source unique de vérité pour Timeline markers ET BantuTeaser preview
- Tests **iter 8 = 100% PASS** (9/9 scénarios, 16/16 pytest, 0 régression).

### v1.5 (iteration 7 - Feb 2026) — REFACTOR
- **♻️ Refactor Daw.jsx** : 2554 → 2019 lignes (-535 LOC, -21%). 13 nouveaux fichiers créés sous `/app/frontend/src/components/daw/`:
  - `MenuBar.jsx` (composant + dropdown logic)
  - `Timeline.jsx` (playhead animation, scrub)
  - `Modal.jsx` (wrapper réutilisable + SetupRow) — **BONUS** : fermeture ESC ajoutée
  - `proToolsMenuConfig.js` (config des 9 menus Pro Tools, 1 source de vérité)
  - `modals/DreamHistoryModal.jsx`
  - `modals/MasteringModal.jsx`
  - `modals/ManualModal.jsx`
  - `modals/GmInstrumentsModal.jsx`
  - `modals/PluginsModal.jsx`
  - `modals/MixerModal.jsx` (MASTER strip désormais toujours visible)
  - `modals/BantuGridModal.jsx`
  - `modals/SetupModal.jsx`
- Tests : **iter 7 = 100% PASS, 0 régression** (9 menus, 8 modals, ESC-close, MIDI+Bantu binding, backend 16/16 pytest).

### v1.4 (iteration 6 - Feb 2026)
- **🐛 CRITICAL FIX** : `autoTempoDetect is not defined` causait un crash blanc. Re-câblé à `detectTrackBpm(selectedTrack.id)` avec fallback statut "Select an audio track first".
- **📱 PWA (Installable Web App)** :
  - `public/manifest.json` complet (name, short_name, icons 192/512/180, theme #a820ff, display=standalone, shortcuts).
  - `public/service-worker.js` : strategy network-first pour shell, cache-first pour assets statiques, jamais cache /api.
  - `src/serviceWorkerRegistration.js` : enregistrement prod-only, dev unregister, listener pour mise à jour.
  - `public/index.html` : nouveaux meta tags (theme-color, apple-mobile-web-app-*, manifest link, icons), title "RIBA - Bantu Digital Audio Workstation".
  - Bouton `Install` (data-testid="install-pwa-btn") dans la TopBar, capture `beforeinstallprompt`.
  - Icônes PNG générées (192/512/180) avec logo magenta + texte RIBA.

## Testing
- **Iter 6**: **16/16 backend pytest PASS**, frontend 100% (chargement sans crash, menus Reverse Audio + Auto Tempo OK, 5 assets PWA servis 200, manifest valide, meta tags présents).

## ⚠️ Known Limitations
- **MOCKED**: VST plugin loading, Magic12 stem separation, MIDI→Audio / Audio→MIDI conversions (no real DSP).
- **LLM BUDGET EXCEEDED**: Dream/Mastering fall back to procedural. Top up at Profile → Universal Key → Add Balance.

## Prioritized Backlog
- **P1**: Wrapper Electron / Tauri pour `.exe` / `.dmg` natif.
- **P1**: Real MP3 export (lamejs).
- **P2**: Real Audio→MIDI via CREPE/YIN pitch detection; Spleeter-WASM for real stem separation.
- **P2**: WebMIDI input for external MIDI keyboards.
- **P2**: Visualize Bantu Grid markers on Timeline (currently only snapping notes).
- **P2**: Refactor Daw.jsx (2555 lignes) en sous-fichiers /app/frontend/src/components/daw/ (MenuBar, BantuModal, SetupModal).

## Next Action Items
- PWA prête → tester l'installation depuis Chrome/Edge desktop (icône "+" dans la barre d'URL).
- Démarrer le wrapper Electron pour version desktop native.
- Top up Emergent LLM key pour réactiver Dream Track et Magic12 Master.
