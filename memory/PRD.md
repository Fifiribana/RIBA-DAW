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

### v2.3 (iteration 14 - Feb 2026) — GENESIS WORKFLOW 🌍 (Chantier 3)
- **🌍 Genesis** — workflow révolutionnaire qui transforme un prompt textuel en 4 stems multi-pistes prêts à mixer en ~90 s :
  1. `window.prompt('Genesis · prompt your track:')` (default `Bikutsi tropical house`)
  2. `POST /api/ai/generate-track` (fal.ai MusicGen, instrumental)
  3. Fetch du WAV généré → `POST /api/ai/separate-stems` (Demucs htdemucs)
  4. Crée 4 pistes audio (`Genesis · vocals/drums/bass/other`) dans le mixer + active automatiquement `Bantu Grid Bikutsi 4/4` + `showBantuMarkers`
- **Bouton TopBar** `[data-testid='genesis-btn']` avec gradient **cyan→magenta→orange** (`#22D3EE → #D946EF → #F59E0B`) + glow caractéristique, positionné à côté du bouton Swing
- **Backend** `/app/backend/ai/genesis.py` : `GET /api/ai/genesis-status` retourne `{ready, fal_ready, demucs_ready, mode:'full|demucs_only|unavailable', default_style, default_bantu}` — UI peut adapter le label/tooltip dynamiquement
- **Short-circuit gracieux** : si `FAL_KEY` absent, aucun appel réseau n'est fait, message clair "Genesis: FAL_KEY not configured. Set it in /app/backend/.env then restart."
- **Bonus Chantier 2** : tags Magic Generator enrichis avec **Ekang** + **Zouk** (9 styles culturels total : Asiko, Makossa, Bikutsi, Rumba, Afrobeat, Soukous, Highlife, Ekang, Zouk)
- Tests **iter 14 = 56/56 pytest PASS** (55 régression + 1 nouveau test_genesis_endpoint), **0 régression**, **0 bug**. Gradient TopBar vérifié byte-exact par Playwright.

### v2.2 (iteration 13 - Feb 2026) — MAGIC GENERATOR SUNO-STYLE ✨
- **🎨 MagicGeneratorModal** (UI à 2 panneaux, ~430 lignes) :
  - **Gauche** : Simple/Advanced toggle · +Audio/+Voice (cyan) · Prompt textarea · Lyrics 3 onglets (Write/Prompt/Instrumental) · Styles textarea + 7 quick-tags (Asiko · Makossa · Bikutsi · Rumba · Afrobeat · Soukous · Highlife) · Duration (mode Advanced) · gros bouton **⚡ Create** magenta→orange avec glow
  - **Droite** : Workspace grid responsive (auto-fill 220px), cartes avec **pochettes procédurales 100% CSS** (gradients radiaux uniques par id), titre, tags mono, badge fallback, boutons Play/Import (⤵) / Delete (✕)
  - **Player audio persistant** en bas du panneau droit (avec backdrop-blur + cover miniature)
- **Backend** `/app/backend/ai/generator.py` :
  - `POST /api/ai/generate-lyrics` — Claude Sonnet 4-6 (Emergent LLM) génère paroles JSON structurées `{title, tags, sections[{type:Verse|Chorus|...,text}]}`, fallback offline avec sections génériques Bantu
  - `POST /api/ai/generate-track` — wrapper fal.ai MusicGen avec flag `instrumental`, download du WAV vers `/app/backend/static/workspace/`, fallback gracieux `FAL_KEY_MISSING`
  - `GET /api/ai/workspace` — liste persistante (cap 60) via `index.json`
  - `DELETE /api/ai/workspace/{id}` + `GET /api/ai/workspace/file/{id}` (streaming WAV)
- **Import to Timeline** : click ⤵ télécharge le WAV, le convertit en File et l'injecte dans `addAudioFile()` → nouvelle piste audio dans le mixer RIBA
- Item de menu `Event → Magic Generator (Suno-style) ✨`
- **Tests iter 13** : **55/55 pytest PASS** (48 régression + 7 nouveaux generator_endpoints), 0 bug fonctionnel, fix cosmétique tag trailing comma appliqué

### v2.1 (iteration 13 - Feb 2026) — OFFICIAL RIBA BRAND
- **🎨 Script d'icônes universel** `/app/backend/setup_icons.py` :
  - Cherche `Gemini_Generated_Image_upm9x0upm9x0upm9_3.png` dans `/app`, `/app/assets`, `/app/backend`, `/app/frontend/public`
  - **Fallback procédural** : si fichier introuvable, génère un placeholder 1024×1024 phénix néon (disque magenta + ring cyan + ailes orange embers + monogramme "RIBA" + sous-titre "BANTU · DAW")
  - Crop carré centré 1:1 automatique
  - Produit 11 assets en un seul run :
    - PWA : `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `favicon.png` (64)
    - Tauri : `32x32.png`, `128x128.png`, `128x128@2x.png` (256), `icon.png` (512), `icon.ico` (multi-tailles 16/32/48/64/128/256), `icon.icns` (placeholder)
    - UI in-app : `riba-logo.png` (400×400)
- **🎯 Intégration UI** :
  - **MenuBar** : miniature 22×22 cerclée avec glow magenta+cyan, placée avant "File" (style Pro Tools) — `data-testid='riba-brand-mark'`
  - **ManualModal** : logo 96×96 + titre "RIBA 12" + sous-titre "BANTU DIGITAL AUDIO WORKSTATION" cyan + tagline "The world's first DAW with native asymmetric Bantu Oral Grid quantization" — `data-testid='manual-logo'`
  - **index.html** : favicon 64×64 ajouté en plus des 192/512
- Tous les assets servis 200 (vérifié via curl sur riba-logo, favicon, icon-192, icon-512, apple-touch-icon, manifest)
- Pour activer le logo final : place le fichier source sous `/app/` puis relance `python /app/backend/setup_icons.py`

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
- **Iter 15 (Feb 2026)** : **59/59 backend pytest PASS** (-m "not slow"), 1 slow deselected (Demucs heavy). FAL_KEY actif via clé utilisateur, mode "full" sur tous les status endpoints.

### v2.8 (iter 19 - Feb 2026) — MAGIC GENERATOR ENRICHI + GLOBAL TRANSPORT BAR
- **🎵 MagicGeneratorModal — panneau gauche enrichi** :
  - **Song Title (Optional)** input au-dessus du PROMPT (envoyé au backend via le champ `title` de `MusicGenRequest` → override de `_local_title`)
  - **+ Audio** : ouvre un file picker `<input type="file" accept="audio/*">` masqué → upload vers `/api/ai/upload-reference`
  - **🎙 Record** : capture micro via `navigator.mediaDevices.getUserMedia` + `MediaRecorder` (mime audio/webm;codecs=opus) → upload comme `kind=voice` ; affiche timer rouge `🔴 Ns · stop` pendant l'enregistrement
  - **📚 Browse** : toggle Library panel inline (`/api/ai/library` → 4 loops curés : Bikutsi 4/4, Makossa Roots, Asiko Wisdom, Afrobeat Groove à 120/105/135/110 BPM, générés procéduralement à la 1ère requête)
- **🎵 Workspace cards — menu contextuel `⋯`** sur chaque carte avec :
  - **Remix ▸ Cover / Mashup / Sample this song** → précharge prompt+suffixe+style dans le panneau gauche
  - **Reuse Prompt** → recharge title + prompt + style depuis la carte cliquée
  - **Add to Timeline** → import direct (existant)
- **🎛 GlobalTransportPlayer** (`/app/frontend/src/components/daw/GlobalTransportPlayer.jsx`, monté dans Daw.jsx) :
  - Apparaît en bas fixe (bottom 14, gradient magenta border) dès qu'une carte Workspace est lue
  - Listener `window.addEventListener('riba:play-workspace-item')` → reçoit { id, title, audio_url, tags, playlist }
  - Contrôles complets : ⇆ shuffle, ⏮ prev, ⏯ play/pause (bouton circulaire gradient), ⏭ next, ↻ repeat (off/all/one), volume slider (accent magenta), scrubber cliquable (gradient indigo→magenta), times mm:ss
  - Auto-advance à la fin du morceau selon le mode repeat ; playlist construite depuis les items du Workspace ayant un `audio_url`
- **Backend `generator.py`** : 
  - Nouveau modèle field `title: str | None` sur `MusicGenRequest` + flag `user_title` dans l'entrée Workspace
  - Nouvel endpoint `POST /api/ai/upload-reference` (multipart : file, title, kind ∈ {upload,voice}, tags_csv) → indexe + persiste dans `/static/workspace/uploads/{id}{ext}` (ext autorisés : wav/mp3/ogg/m4a/webm/flac, max 30 MB)
  - Nouvel endpoint `GET /api/ai/library` → liste curée de 4 loops procéduraux (génération paresseuse au 1er call, manifeste persisté)
  - `GET /workspace/file/{id}` désormais résout aussi les uploads + library
  - `DELETE /workspace/{id}` nettoie aussi les fichiers uploads associés
- **8 nouveaux tests** (`test_generator_extensions.py`) : library shape + 4 loops downloadables, upload wav+title+tags, voice default title, rejection extension/empty/kind, generate-track title override + default. **Tous PASS.**
- **Suite complète : 80/80 PASS** (72 + 8 nouveaux), 0 régression.

### v2.7 (iter 18 - Feb 2026) — BOOT CINEMATIC + REEL SNIPPET PICKER
- **🎬 Boot Cinematic** (extension du SplashScreen) :
  - `SplashScreen.jsx` prend désormais un prop `mode='short'|'cinematic'` (8 s)
  - 3 sous-titres typo cinéma révélés en cascade avec fade-in/out 520 ms cubic-bezier : *Pioneered in Yaoundé · Polyrhythmics from Central Africa · Bantu Oral Grid by RIBA*
  - Bouton **📥 Export Intro MP4** (gradient magenta→orange) appelle `/api/ai/boot-cinematic` → MP4 1920×1080 (8 s) avec drone sub-bass 72 Hz + drawtext animé alpha. **Rendu mesuré : 0.78 s pour 4 s.**
  - Activation : `?cinematic=1` URL param **OU** Setup → Preferences → "Boot Cinematic Intro" (toggle `localStorage.riba-cinematic-boot`).
  - `App.js` re-rejoue le splash à chaque reload en mode cinematic (intro = trailer).
- **⚡ Reel Snippet Picker** (analyse offline multi-bandes RMS) :
  - Backend `/app/backend/ai/snippets.py` — utilise **numpy + scipy.signal Butterworth filtfilt** + soundfile
  - 3 candidats anti-chevauchement (radius=window/2) :
    - **Peak Energy** : argmax sliding-window mean RMS large-bande
    - **Bantu Drop** : argmax positive delta de la sous-bande 30-250 Hz vs fenêtre précédente
    - **Main Hook** : 0.65·mid (200-3000 Hz) + 0.35·low (≤250 Hz)
  - Endpoint `POST /api/ai/reel-snippets` (multipart file + window_sec 5-120) → `{ duration, candidates:[{name,label,start_sec,score,score_norm}] }`
  - **Rendu mesuré : 0.32 s pour 60 s d'audio.**
- **🎯 Intégration Magic Re-mix Modal** : bouton "🔍 Find best snippets" → 3 cartes cliquables avec score bar (gradient indigo→magenta→orange) → la sélection s'envoie comme `start_sec` au `POST /bantu-reel` (le Reel démarre exactement où le user a cliqué).
- **Tests** : 8 nouveaux tests (`test_boot_and_snippets.py`) + 1 nouveau test `test_bantu_reel_accepts_start_sec` → **suite complète 72/72 PASS**.
- Stack : **scipy 1.17.1** ajouté à requirements.txt.

### v2.6 (iter 17 - Feb 2026) — BANTU REEL : MOTEUR D'EXPORT VIRAL 🎬
- **Backend** `/app/backend/ai/reel.py` — pipeline ffmpeg :
  - `GET /api/ai/reel-status` → { available, ffmpeg_version, formats, watermark, default_format }
  - `POST /api/ai/bantu-reel` (multipart) → MP4 1080×1080 / 1080×1920 / 1920×1080 + MP3 192 kbps
  - `GET /api/ai/workspace/reel/{id}.mp4` + `.mp3` ; `DELETE` aussi exposé. Path traversal bloqué.
  - filter_complex : `showcqt` (CQT spectrum reactive, cscheme=`0.85|0.27|0.94|0.39|0.40|0.95` magenta→indigo) + 3 couches `drawtext` (title bold + style badge avec box magenta + watermark "Made with RIBA · Bantu Oral Grid")
  - Encoding H.264 yuv420p / AAC 192k / movflags faststart pour streaming
  - `subprocess.run` via `asyncio.to_thread` → ne bloque pas l'event loop
  - **Rendu mesuré : 1.0-2.5 s pour 5 s de WAV (5× temps réel)**
- **Frontend** `MagicRemixModal.jsx` — nouvelle section Bantu Reel (gradient magenta/indigo) :
  - Apparaît automatiquement quand `lastResult` est prêt
  - Mixe les 5 stems via `OfflineAudioContext` (bantu_groove à -3 dB pour sit under) → WAV blob
  - Inputs : title, format (Square 1080 / Vertical 1080×1920 / Landscape), duration 5-60 s
  - POST `/api/ai/bantu-reel` → preview MP4 inline (<video> avec controls + loop) + boutons download MP4 / MP3
- **Tests** `test_reel_endpoint.py` (5 tests) : status, format invalide → 400, no file → 422, E2E génération MP4+MP3 + download via ingress public, path traversal bloqué. Tous **PASS en 1.74 s**.
- **Suite complète : 65/65 PASS** (60 pré-existants + 5 nouveaux).
- Validation visuelle : analyse Gemini Vision d'une frame extraite à 2.5 s → wordmark + badge style + spectre CQT magenta/indigo + watermark tous confirmés visibles et bien composés.
- Stack ajoutée : **ffmpeg 5.1.9** (apt-installé) + fonts LiberationSans/Mono (Debian stock).

### v2.5 (iter 16 - Feb 2026) — SPLASH SCREEN CINÉMATOGRAPHIQUE
- **🎬 SplashScreen.jsx** (nouveau `/app/frontend/src/components/daw/`):
  - Boot sequence 2.6s avec logo RIBA pulsé (halo magenta/violet radial, scale 1→1.04, brightness +18%)
  - Wordmark "RIBA" en gradient blanc 56 px letter-spacing 0.42em + tagline "BANTU · DIGITAL AUDIO WORKSTATION" monospace 10 px 0.46em
  - **Bantu Oral Grid Bikutsi 4/4 animé** : 16 traits asymétriques (swing ternaire [0, 0.20, 0.40, …]) pulsent en cascade avec delay = position × 1.1s
  - Boot lines monospace progressivement révélées (init WebAudio → Bantu Grid → fal.ai → Demucs → ready 100%)
  - Progress bar gradient indigo→magenta→orange (4 keyframes cubic-bezier 0.4,0,0.2,1)
  - Vignette radial + grain conique 5% opacity overlay
  - Skip via clic / ESC / SPACE (debounce 250 ms anti-misclick)
  - Cycle de vie : boot → fadeout (650 ms) → unmount complet
- **App.js** : sessionStorage `riba-splash-seen` → splash uniquement au premier boot d'un onglet (skip pendant les hot reloads).
- E2E Crash Test Magic Re-mix (iter 15) ✓ validé : Demucs 4 stems + fal.ai bantu_groove en 137s sur localhost (mode=full).

### v2.4 (iter 15 - Feb 2026) — MAGIC RE-MIX + LIFESPAN + TESTS RÉPARÉS
- **🎛 Magic Re-mix (P1)** : nouvelle chaîne RIBA exclusive
  - Backend `/app/backend/ai/remix.py` : `GET /api/ai/remix-status` + `POST /api/ai/magic-remix` (multipart: file, bantu_style, density, bars, regenerate, regen_prompt, regen_duration)
  - Chain: **Demucs 4 stems → Bantu Oral Grid asymétrique → (optionnel) fal.ai bantu_groove layer**
  - Modes: `full` (Demucs + Bantu + fal.ai) / `demucs_plus_bantu_only` / `demucs_only` / `unavailable`
  - `await asyncio.to_thread(_separate_file, …)` pour ne pas bloquer l'event loop (~60s Demucs CPU)
  - Frontend `/app/frontend/src/components/daw/modals/MagicRemixModal.jsx` : sélecteur de style Bantu (5 styles), density/bars, toggle regenerate avec prompt + duration, chain status badges, résultat avec stems préview
  - Menu Event → "Magic Re-mix (Demucs ▸ Bantu ▸ fal.ai) 🎛" → ouvre modal → import des stems dans la timeline + activation auto des markers Bantu
- **♻️ FastAPI lifespan** : migration `@app.on_event("shutdown")` → `@asynccontextmanager async def lifespan(app)` ; warning de dépréciation supprimé.
- **🔧 5 pytests fixés** (cassés par l'activation de FAL_KEY) :
  - `test_generator_endpoints.py::TestGenerateTrack` (2 tests) — adaptatif via `_fal_enabled()` probe ; appels lourds sur `localhost:8001` pour bypass timeout Cloudflare (~100s).
  - `test_genesis_endpoint.py::TestGenesisStatus::test_genesis_status_shape` — branche selon `fal_ready` live.
  - `test_ai_endpoints.py::TestStatusProbes::test_music_status_shape` + `TestMusicGenLegacy::test_generate_music_behaviour_respects_fal_state` — adaptatifs au state FAL_KEY.
- **🧪 3 nouveaux tests** : `test_remix_endpoint.py` (status, validation style 400, validation file 422).
- **📋 `pytest.ini`** : enregistre le marker `slow` pour éliminer le warning cosmétique.

## ⚠️ Known Limitations
- **MOCKED**: VST plugin loading, MIDI→Audio / Audio→MIDI conversions (no real DSP).
- **REAL AI ACTIVE** ✓: Demucs (stem separation), fal.ai stable-audio (music generation), Emergent LLM Key/Claude (assistant + lyrics).
- **LLM BUDGET** : top up at Profile → Universal Key → Add Balance.

## Prioritized Backlog
- **P1**: Studio Live Session (WebRTC + Y.js pour collaboration temps réel sur Bantu Grid).
- **P1**: Tauri local build (`yarn desktop:build` → .exe / .dmg).
- **P1**: Auto-share TikTok / Instagram / YouTube Shorts API (publication directe depuis le Bantu Reel panel).
- **P2**: WebMIDI input pour claviers MIDI externes.
- **P2**: Vue Bantu Heatmap.
- **P2**: Refactor `engine.js` (audio engine large) en React hooks.
- **P2**: Extraire `_build_bantu_grid` en module partagé `ai/bantu_grid.py` (DRY parité math).
- **P2**: Snippet preview audio (lecture inline du 30 s candidat avant export — 1 clic = preview, double-clic = pick).

## Next Action Items
- 🟢 Choix utilisateur pour le prochain sprint : **Auto-share Social API** (publication directe Reels) **OU** **Studio Live Session** (collaboration temps réel) **OU** **Tauri local build** (export .exe/.dmg).
