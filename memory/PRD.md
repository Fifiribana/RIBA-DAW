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

### v2.0 (iteration 12 - Feb 2026) — REAL AI INTEGRATIONS 🤖
- **🧠 RIBA AI Assistant** (`/api/ai/assistant`) — Emergent LLM Key → Claude Sonnet 4-6
  - Module `/app/backend/ai/assistant.py` : SYSTEM_PROMPT avec schéma JSON strict de 21 action types couvrant tracks/mixer/transport/effets/Bantu/modals
  - Fallback local robuste (regex word-boundary, multi-actions par phrase, tempo extraction `(\d+) bpm`, FR+EN)
  - Frontend : nouveau modal `AssistantModal.jsx` (chat avec 5 suggestion chips, action display collapsible, magenta spinner pendant inference)
  - Daw.jsx : `dispatchLlmActions()` reducer qui mappe les 21 types d'actions sur les handlers existants
  - Item de menu `Event → AI Assistant (Chat)` avec raccourci Ctrl+I
- **🎵 fal.ai MusicGen** (`/api/ai/generate-music`) — scaffolding complet
  - Lit `FAL_KEY` depuis `/app/backend/.env` (placeholder `your_fal_key_here` → endpoint retourne 503 propre avec `detail.code='FAL_KEY_MISSING'`)
  - Modèles supportés : musicgen-stereo-melody (default), small, medium, large, stereo-large
  - L'utilisateur n'a qu'à coller sa clé fal.ai dans .env + restart backend pour activer
- **🎚️ Demucs Stems Separation** (`/api/ai/separate-stems`) — RÉEL
  - htdemucs (Hybrid Transformer 4-stem) chargé en lazy, modèle 80 MB téléchargé au premier appel
  - Backend traite l'upload WAV via Demucs CPU, retourne 4 stems (vocals/drums/bass/other) en base64 WAV
  - Frontend : Magic12 Sep → audioBufferToWavBlob → POST multipart → décode chaque stem en AudioBuffer → 4 nouvelles pistes injectées dans le mixer
  - `MagentaOverlay` plein écran pendant les 30-60 s de séparation
- **✨ MagentaSpinner / MagentaOverlay** : composants réutilisables (svg gradient + animation glow magenta) utilisés dans AssistantModal + Demucs overlay
- **Tests (iter 12)** : 6/6 nouveaux tests AI endpoints PASS, **48/48 pytest total** (16 riba_api + 26 bantu parity + 6 ai endpoints), 0 régression. RCA backend bug local-fallback résolu en cours d'itération (regex word-boundary + multi-action).

### v1.9 (iterations 10-11 - Feb 2026) — BANTU SWING LIVE 🥁
- **🥁 Bantu Swing Live** — premier moteur de groove asymétrique appliqué en temps réel sur la lecture, **non destructif** :
  - Bouton TopBar `[data-testid='bantu-swing-toggle']` (label `🥁 Swing` / `🥁 Swing · 70%` en doré quand actif)
  - Click gauche : toggle ON/OFF + status bar
  - Click droit : cycle intensity 30 → 50 → 70 → 100 % (l'utilisateur peut ajuster le "feel" de l'humanisation)
  - Engine : `bantuSwing` config + `setBantuSwing(cfg)` + `_swingPositions()` (cache LRU sur key `style|density|bars`) + `_swingBeat(beat)` (modulo cycle + nearest-neighbour snap × intensity)
  - `playMIDI(bpm, swingFn)` reçoit `this._swingBeat.bind(this)` depuis `play()` et `playAll()` → ne mute PAS `midiNotes[]`, applique seulement le delta au scheduling Web Audio
- **♻️ Réorganisation** : `bantuGrid.js` déplacé de `components/daw/` → `lib/` (module math pur, accessible depuis l'audio engine sans cross-tree weird imports). Imports mis à jour dans Timeline, BantuTeaser, engine, test_bantu_parity.py.
- **🐛 Bug critique iter 10** : import `computeBantuGrid` manquant dans engine.js → `ReferenceError` au PLAY avec Swing ON. **Fixé en iter 11** (1 ligne ajoutée).
- Tests **iter 11 = 100% PASS** : PLAY+Swing OK, PLAY sans Swing OK, 10 menus, Disk/System Usage modals, View→Waveforms→Rectified, **42/42 pytest backend**.

### v1.8 (iteration 9 - Feb 2026) — PRO TOOLS WINDOW MENU + WAVEFORM MODES
- **🪟 Menu Window** (entre View et Setup) avec :
  - Sous-menu **Configurations** : Window Configuration List (Alt+J), New Configuration (Alt+Shift+J)
  - Sous-menu **Arrange** : Tile, Tile Horizontal, Tile Vertical, Cascade
  - **Disk Usage** et **System Usage** (entrées indépendantes)
- **🌊 View → Waveforms** sous-menu : Peak, Power, Rectified, Outlines, Overlapped Crossfades
- **🪛 SystemUsageModal** : jauge CPU TOTAL + grille 24 cores (data-testid `core-0`..`core-23`, couleurs cyan/orange/rouge selon charge), jauges Disk + Memory, infos Buffer Underruns / Voices Active / Session uptime, random walk live 220 ms
- **💾 DiskUsageModal** : table de 5 volumes simulés (Macintosh HD, Sessions SSD, Samples RAID, Backup HDD, RIBA Cloud) avec colonnes Type/Mount/Size/Used/Free/% + **48 kHz 24 Bit Track Min** calculée (17.28 MB/min stereo 24-bit/48 kHz → 1560 GB ≈ 1540.7 hr ✓)
- **🎨 5 modes de waveform** propagés via `waveformMode` state à `TrackRow` → `Waveform.jsx` (peak/power/rectified/outlines/crossfades)
- **♻️ MenuBar.jsx réécrit** : nouveau composant `MenuRow` supportant les sous-menus right-flyout (hover-driven, `data-testid='submenu-{id}'`)
- Tests **iter 9 = 100% PASS** (9/9 scénarios, **42/42 pytest backend**, 0 régression, math Disk Usage validée)

### v1.7 (iteration 9 - Feb 2026) — PARITY TESTS + TAURI SKELETON
- **🧪 Test de parité math backend ↔ frontend** : `/app/backend/tests/test_bantu_parity.py`
  - Compare `_build_bantu_grid` (Python) vs `computeBantuGrid` (JS via `node`) sur 5 styles × 5 combos (density, bars) = **25 cas, 0 dérive** + 1 sanity test.
  - Tolérance `1e-4`. **26/26 PASS** — parité byte-identique garantie sur Asiko, Makossa, Bikutsi 4/4, 6/8, 12/24.
- **🖥️ Squelette Tauri v2** sous `/app/src-tauri/` :
  - `tauri.conf.json` complet (window 1440×900, dark theme, identifier `com.emergent.riba`, bundle targets `dmg/msi/nsis/deb/appimage/app`)
  - `Cargo.toml` (tauri 2.0 + tauri-plugin-shell), `build.rs`, `src/main.rs`, `src/lib.rs` (devtools auto en debug, bloc sidecar FastAPI commenté/prêt à activer)
  - `capabilities/default.json` (permissions core + shell)
  - Icons 32/128/256/512 PNG + ICO multi-tailles + ICNS placeholder
  - Helper `/app/frontend/src/lib/runtime.js` détecte `window.__TAURI_INTERNALS__` et bascule sur `127.0.0.1:8001` quand bundlé
  - `serviceWorkerRegistration.js` patché pour skip en environnement Tauri
  - `package.json` : ajout `"homepage": "./"` (asset paths relatifs pour Tauri) + scripts `tauri`, `desktop:dev`, `desktop:build`
  - **`/app/DESKTOP.md`** : guide complet build local (prereqs Rust/Yarn/OS toolchain, dev/build/sidecar/CI GitHub Actions)

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
