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

### v3.1 (iter 22 - Feb 2026) — STUDIO LIVE SESSION 🎛 + PROMO CASCADE ⚡
- **🎛 Studio Live Session** — collaboration temps réel WebRTC/Y.js :
  - **Backend `ai/studio_live.py`** : route `WS /api/ws/session/{id}` qui relaye en broadcast tous les frames Y.js (binaire) + frames presence (texte) entre les peers connectés. `_PEERS: dict[session_id, set[WebSocket]]` thread-safe via asyncio.Lock. **Aucun frame JSON envoyé aux clients y-websocket** (briserait le protocole binaire de Y.js).
  - Endpoint `GET /api/sessions` → liste des sessions actives avec peer counts.
  - **Frontend `useStudioLive.js`** : hook React qui se connecte automatiquement quand `?session=<id>` est présent dans l'URL. Synchronise `tempo`, `bantuStyle`, `bantuDensity`, `bantuBars` à une `Y.Map` partagée → chaque modif locale est broadcasted aux collaborateurs.
  - **Awareness Y.js** : chaque user reçoit un nom aléatoire (WildDrum, SolarPhoenix…) + une couleur dans la palette RIBA. `StudioLiveBadge` top-right affiche : indicateur vert connecté / session ID / peer count + jusqu'à 4 avatars colorés des collaborateurs.
  - Mode solo (sans `?session=`) → hook inerte, aucun overhead.
  - Stack : **yjs 13.6.31 + y-websocket 3.0.0** (frontend) ; **websockets + pytest-asyncio** (tests).

- **⚡ Promo Cascade** — plan média auto-piloté 7 jours :
  - Backend `ai/promo.py` : `POST /api/ai/promo-cascade` (body: track_ids, mode, schedule offsets [0,2,4,6] jours, platforms, autopublish)
  - Pipeline complet :
    1. Génère le **teaser album 60s** via `album_teaser()` (réutilise Bantu Drop Map)
    2. Extrait l'audio du teaser en WAV temp via ffmpeg
    3. `analyze_snippets` sur le teaser → Peak / Drop / Hook offsets
    4. Coupe **3 micro-reels 15s** depuis le teaser MP4 avec les overlays RIBA (`_build_filter_complex` réutilisé)
    5. Planifie **4 publish jobs par plateforme** via `schedule_publish_job()` → APScheduler
  - Statut `scheduled` si plateforme READY, sinon `pack_only` (téléchargeables manuellement)
  - **Frontend** : bouton "⚡ Launch Promo Cascade (7 days, 4 reels)" gradient orange→magenta dans `AlbumBuilderPanel` avec affichage du plan : J+0/J+2/J+4/J+6 × platform + status par job + 3 cartes de download des micro-reels Peak/Drop/Hook.

- **5 nouveaux tests** (`test_promo_and_studio_live.py`) :
  - Cascade `pack_only` quand aucune plateforme configurée (teaser + 3 micro-reels validés)
  - Cascade validation errors (empty/bad schedule/unknown platform)
  - Sessions endpoint vide
  - WebSocket relay 2 clients (binary bytes A→B + text frame B→A)
  - Sessions listées pendant connexion
- **Suite complète : 100/100 PASS** ✅ (95 → +5 nouveaux). **Verrou 100+ franchi.** 0 régression.

### v3.0 (iter 21 - Feb 2026) — ALBUM BUILDER 🎼 + BANTU DROP MAP + APSCHEDULER
- **🎼 Backend `ai/album.py`** — moteur d'album teaser avec Bantu Drop Map :
  - `POST /api/ai/album/teaser` (body : track_ids 1-16, mode drop_map|sequential, target_duration 15-120, transition_sec 0.5-3, bantu_style, title, style_label)
  - **Drop Map mode** : lance `analyze_snippets` sur chaque track → sélectionne le meilleur segment via priorité `bantu_drop > peak_energy > main_hook` ; **Sequential** : utilise le début de chaque track.
  - **Crossfade aligné Bantu Grid** : `_snap_transition_to_bantu_grid()` projette la durée de fondu sur la subdivision de grille la plus proche (1.0s → 1.013s pour bikutsi_44 par exemple) pour ne jamais casser le swing.
  - Chaîne ffmpeg : N inputs avec `-ss start -t seg_sec` → `acrossfade=d=transition:c1=tri:c2=tri` enchaîné → mixdown WAV → `showcqt + drawtext` réutilisé du Bantu Reel → MP4 1080×1080 + MP3 192k.
  - **Mosaic cover collage PNG** : `make_mosaic_cover()` génère une grille 1x3/2x2/3x3/4x4 de tuiles HSL déterministes (mirror de `ProceduralCover` frontend) + bande titre + sub-tagline magenta. Endpoint `GET /api/ai/album/cover/{id}.png`.
  - `_resolve_track()` consulte workspace index + library manifest (LIB-*) → résout titres/tags correctement pour le mosaic.
- **⚙️ Backend `ai/scheduler.py`** — worker APScheduler 3.11.2 (AsyncIOScheduler) :
  - Job de balayage toutes les **30 s** sur `/static/workspace/scheduled_jobs.json` (persistance disque pour survivre aux redémarrages).
  - Lit les jobs `pending` dont `schedule_at <= now` → exécute le publish via `_publish_tiktok`/`_publish_instagram`/`_publish_youtube` (lazy import pour éviter cycle).
  - Branché dans le lifespan FastAPI (`start_scheduler()` au boot, `shutdown_scheduler()` au stop).
  - `POST /api/ai/share/{platform}/publish` avec `schedule_at` sur TikTok/IG → `schedule_publish_job()` persiste + APScheduler exécute automatiquement à l'heure dite.
  - Nouvel endpoint `GET /api/ai/share/scheduled` → liste les jobs persistés.
- **🎼 Frontend `AlbumBuilderPanel.jsx`** : onglet `🎼 Album Builder` dans `MagicGeneratorModal` (tab switcher gradient en tête) :
  - Panneau gauche : liste scrollable des items workspace avec `audio_url`, sélection par clic (+ numéro d'ordre), **drag-and-drop HTML5** pour réordonner les sélectionnés.
  - Panneau droit : config (title, Bantu style, mode, target duration 15-120, crossfade 0.5-3) + bouton "📱 Export Full Album Teaser" + preview vidéo + boutons download MP4/MP3/Cover + liste des picks par segment (avec le `picked_name` Bantu Drop / Peak / Hook).
- **6 nouveaux tests** (`test_album_and_scheduler.py`) : drop_map E2E avec 3 loops + cover + segments, sequential mode (start_sec=0 partout), validation (empty/unknown/bad mode/>16), path traversal cover, scheduler endpoint, schedule_at requires creds. **Tous PASS en 4.08s.**
- **Suite complète : 95/95 PASS** (89 + 6 nouveaux). 0 régression.
- Stack ajoutée : **APScheduler 3.11.2 + tzlocal 5.4.3**. Pillow 12.2.0 déjà présent.

### v2.9 (iter 20 - Feb 2026) — AUTO-SHARE SOCIAL API 📡
- **Backend** `/app/backend/ai/share.py` — moteur de publication multi-plateformes :
  - `GET /api/ai/share/status` → readiness par plateforme (TikTok / Instagram Reels / YouTube Shorts) avec `missing` env vars, `schedule_native`, `needs_public_url`
  - `POST /api/ai/share/prepare` → génère description + hashtags + packs par plateforme respectant chaque limite (caption ≤ 2200, YouTube title ≤ 100 + auto `#Shorts`, YouTube tags sans `#`). Hashtags automatiques basés sur le style (`bikutsi_44` → `#Bikutsi #BikutsiGroove #Cameroon`) + brand stack `#RIBA #BantuOralGrid #MadeWithRIBA` + extras user. Style canonicalization tolérante ("Bikutsi 4/4" → `bikutsi_44`).
  - `POST /api/ai/share/{platform}/publish` — adaptateurs réels :
    - **TikTok** : Content Posting API (`/v2/post/publish/video/init/` → PUT chunk upload)
    - **Instagram Reels** : Graph API v19 (`media` container → polling FINISHED → `media_publish`) — nécessite PUBLIC_BASE_URL pour servir le MP4
    - **YouTube Shorts** : `google-api-python-client` `videos.insert` avec `publishAt` pour scheduling natif
  - Fallback structuré 503 `{platform}_CREDS_MISSING` avec la liste exacte des env vars manquantes + message d'aide
  - `GET /api/ai/share/jobs` → log en mémoire des derniers jobs (publish/scheduled/failed)
- **Frontend** : nouveau panneau **📡 Auto-share** dans `MagicRemixModal` (gradient indigo→cyan) apparaissant après `reelOutput` :
  - Description textarea + Extra hashtags input + Schedule datetime-local
  - Chips automatiques de hashtags (auto-refresh à chaque modification)
  - 3 cartes plateforme avec badge `READY`/`CONFIG`, bouton "📤 Publish" (actif si configuré), bouton "📋 COPY CAPTION" (toujours disponible pour upload manuel), affichage des env vars manquantes
  - Affichage du dernier job en cours / publié / programmé
- **Tests** `test_share_endpoints.py` (9 tests) : status shape, prepare avec/sans style + fuzzy match + skip RIBA brand + limits truncation, unknown platform → 400, missing creds → 503 sur les 3 plateformes avec code+missing+message validés, jobs list. **Tous PASS en 1.12s.**
- **Suite complète : 89/89 PASS** (80 + 9 nouveaux), 0 régression.
- **Stack ajoutée** : `google-api-python-client 2.197.0`, `google-auth-oauthlib 1.4.0`, `google-auth-httplib2 0.4.0`. Tous installés via `pip freeze` ➜ requirements.txt.

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
- **REAL AI ACTIVE** ✓: Demucs (stem separation), fal.ai stable-audio (music generation), Emergent LLM Key/Claude (assistant + lyrics + storytelling).
- **LLM BUDGET** : top up at Profile → Universal Key → Add Balance.
- **Desktop build** : cross-compile depuis le container Linux ARM64 vers Windows/macOS impossible — voir `/app/DESKTOP_RELEASE.md`. Le pipeline GitHub Actions `release.yml` produit les vrais installateurs signables sur push de tag `v*.*.*`.

### v3.11 (this iteration - Feb 2026) — SNAPSHOT OF THE WEEK 🏆 + UX POLISH ✨
- **🏆 Snapshot of the Week** (`/app/backend/ai/midi.py`) — moteur communautaire de découverte :
  - **`POST /api/midi/snapshots/{id}/import`** : log d'un import sur snapshot **public uniquement** (snapshots privés → 403). Insertion dans `midi_snapshot_imports` (timestamp + importer + owner) **+ denormalisation** sur le doc snapshot (`import_count++`, `last_imported_at`). Pas de dédup par importer — re-importer dans une autre session est un signal de valeur réel ; la fenêtre rolling 7 jours limite naturellement les abus.
  - **`GET /api/midi/snapshots/featured?window_days=7`** : Mongo aggregate `$match cutoff → $group snapshot_id → $sort desc → $limit 20` puis **fallback sur les 20 top candidats** (skip ceux unshared/supprimés depuis) — un snapshot révoqué ne réduit jamais la bannière au silence. Retourne `{featured, window_days, window_count, computed_at}` ou `featured=null` si aucun import.
  - **`GET /api/midi/snapshots/leaderboard?window_days=7&limit=10`** : top-N pour widget sidebar futur ; **redaction systématique** des champs `notes`/`cc` (poids + sécurité).
  - **Path ordering corrigé** : `/snapshots/featured` et `/snapshots/leaderboard` placés AVANT `/snapshots/{snapshot_id}` dans la registration pour que FastAPI matche les routes statiques en premier.
- **🎨 Frontend bannière** (`MidiSnapshotLibrary.jsx`) :
  - Bannière 🏆 magenta→amber au-dessus de la liste owner-scoped quand `featured` non-null : nom + tagline + compteur traduit (`5 griots imported it this week`) + bouton Import gradient.
  - **Apply Public** déclenche désormais automatiquement le **POST /import** en arrière-plan (best-effort, swallowed errors) puis refresh la bannière.
  - **Compteurs visibles** sur chaque public row : `⬇ 5` en amber quand `import_count > 0`.
- **✨ UX polish** :
  - **Suppression du `window.location.reload()`** post-Apply Snapshot. Nouvelle méthode `replaceAssignments(snapshot)` exposée par `useMidiLearn()` : reconstruit la map `assignments[]` localement à partir des `notes`+`cc` du snapshot. Apply est désormais **instantané** (pas de rechargement de page → pas de perte de contexte audio/transport).
  - Le statut "✓ applied" reste visible 2.5 s au lieu d'un reload brutal.
- **🌐 i18n** : 2 nouvelles clés `midi.snapshots.sotwLabel` + `midi.snapshots.sotwCount` (avec interpolation `{{count}}`) en **EN / FR / ES / PT / SW**, verrouillées par locale parity test.
- **📊 Tests** : **+13 nets** (224 → **237 collectés**) :
  - `test_snapshot_of_the_week.py` (13 tests) : compteur incrémenté correctement, refus snapshots privés (403), 404 sur unknown id, validation importer key, top-N ordering, redaction leaderboard, clamp window_days/limit, fallback past unshared, isolation cross-snapshot.
  - Locale parity étendu (`midi.snapshots` passe de 17 à 19 clés).
- **🎬 Smoke UI validé** : bannière rendue dans Setup → MIDI Input… avec `data-testid='midi-snapshot-featured-banner'`, `-apply`, `-count`. Text traduit affiché correctement ("5 griots imported it this week"). Community presets count visible (30 imports loggés au cumul des tests).

### v3.10 (iter 31 - Feb 2026) — MIXER MIDI LEARN 🎛️ + SNAPSHOT LIBRARY 💾 + VISUAL QUANTIZE 🎯
- **🎛️ P0 · MIDI Learn par piste (MixerModal.jsx réécrite)** : chaque tranche de console expose 4 cibles MIDI Learn — `track.{id}.volume` / `pan` / `mute` / `solo` — câblées via `<MidiLearnTrigger>` avec data-testid systématiques `mixer-strip-{id}-{vol,pan,mute,solo}-midi-wrap`. Right-click ouvre le micro-menu, l'arming pulse magenta, et la pill globale s'affiche. Le dispatcher Daw.jsx résout désormais dans l'ordre **armed > user-learnt (per-track) > factory-default** ; pour CC : `volume` = 0..127 → 0..100 %, `pan` = 0..127 → -50..+50, `mute`/`solo` togglent quand CC ≥ 64 ; pour note-on, `mute`/`solo` togglent en mode pad-trigger.
- **💾 P1 · MIDI Snapshot Library** (backend `midi.py` + UI `MidiSnapshotLibrary.jsx`) :
  - **Backend** : 6 routes — `POST /api/midi/snapshots` (upsert par `(owner, name)` avec `$setOnInsert` id stable), `GET /snapshots?owner=X` (liste owner-scoped triée `updated_at desc`), `GET /snapshots/{id}` (payload complet), `GET /snapshots/public` (shared=true, **notes/cc redactés**), `DELETE /snapshots/{id}?owner=X` (cross-owner protégé → 404), `POST /snapshots/{id}/share?owner=X&shared=Y&share_label=Z` (toggle public + tagline). Regex nom : Latin Extended + Latin Extended Additional + em-dash (U+2010-2015) → noms griots/diaspora pris en charge (`Studio Yaoundé — Bantú Sessions`).
  - **Frontend** : panneau intégré dans `Setup → MIDI Input...` sous la mapping reference card. Input nom + Save (désactivé si `liveCount=0` OU nom vide), liste owner-scoped (Apply / Share-Unshare / Delete), tagline optionnelle, **section "Community presets · Bantu Library"** publique avec bouton Import 1-clic qui PATCH chaque binding via l'endpoint v3.9 puis reload pour resync l'UI.
  - **Tests** : 18 nouveaux tests couvrant CRUD complet, upsert stabilité, validation noms (accentués / em-dash / slashes / >80 chars), validation pitch, partage avec/sans owner, listing public redacté.
- **🎯 P2 · Visual Quantize Overlay** (`VisualQuantizeOverlay.jsx`) : strip 26 px sous la `Timeline`, visible quand Bantu Markers ON. Chaque note MIDI capturée pousse via ref `push(rawBeat, quantizedBeat, pitch)` → halos magenta (raw) + amber (quantisé) avec tick reliant les deux, fade 4 s, capping 12 events. `data-testid='visual-quantize-overlay'` + `visual-quantize-empty` (placeholder *"Awaiting MIDI input…"*). Aussi alimenté quand aucune piste MIDI sélectionnée — feedback visuel pédagogique sur le Bantu Swing en temps réel.
- **🌐 i18n complet** : `midi.snapshots.*` (17 clés) + `midi.quantize.*` (3 clés) en **EN / FR / ES / PT / SW**, verrouillés par `test_locale_coverage.py`.
- **📊 Tests** : **+18 tests nets** (206 → **224 collectés**, objectif >220 dépassé). 56/56 PASS sur les modules v3.10 (midi_snapshots 18 + midi_learn 14 + midi 21 + locale_coverage 3). 11 échecs préexistants liés au binaire `ffmpeg` manquant du container preview (album_teaser, boot_cinematic, bantu_reel, promo_cascade) — non causés par v3.10.
- **🎬 Smoke UI** : tous data-testid confirmés présents ; Mixer post-création-MIDI-track expose les 4 wraps par strip ; right-click + Learn arme correctement avec pill globale i18n.

### v3.9 (iter 30 - Feb 2026) — UNIVERSAL MIDI LEARN 🎚️ + OAUTH PREP 🔐
- **🎚️ MIDI Learn universel** (`/app/frontend/src/hooks/useMidiLearn.js` + `MidiLearnTrigger.jsx`) :
  - **Right-click n'importe où** sur les faders / knobs / boutons transport pour ouvrir un mini-menu contextuel ("Learn next MIDI control" / "Unbind" / "Cancel"). UI portal-rendered, anchored au curseur, fermeture à l'outside-click.
  - **Armement visuel** : la cible armée pulse magenta (outline + glow 14 px). Une pill flottante 'Learning · {label} · play a note or move a knob…' s'affiche en bas centré, avec bouton Cancel + TTL auto 12 s.
  - **Capture à la volée** : dès qu'un événement MIDI (note-on ou CC) arrive après armement, il est lié à l'action ciblée ; les bindings antérieurs sur la même touche physique sont écrasés côté front pour cohérence UX.
  - **Persistance backend** : `PATCH /api/midi/mapping/{owner}/learn` upsert 2-étapes (évite le conflit Mongo `$set + $setOnInsert` sur path dotted) — fait de chaque griot un détenteur de son mapping matériel personnel, rechargé à l'init via `GET /api/midi/mapping/{owner}` puis reverse-mappé en `assignments[action] = {kind, key}`.
  - **Résolution dispatch** (Daw.jsx) : ordre `armed → user-learnt → factory-default` ; supporte des bindings spécialisés `track.{id}.volume` et `track.{id}.pan`.
  - **Owner persisté** dans `localStorage['riba-midi-owner']` (auto-généré `griot_xxxxxxxx` au 1er load) — stable cross-session.
  - **UI wrap** : 5 cibles primaires câblées en v3.9 — `transport.play`, `transport.record`, `transport.loop`, `transport.metronome`, `tempo.set`, `master.volume`. Chacune expose `data-testid={base}-midi-{wrap,menu,learn-btn,unbind-btn,badge}` pour test surface.
  - **Badge visuel** : quand un binding existe, un mini badge magenta (`CC22` / `N36`) s'affiche en haut-droite du contrôle — feedback instantané et identifiable.
- **🔐 OAuth scaffolding** (`/app/backend/ai/share.py`) :
  - `_OAUTH_PROVIDERS` dict : 3 providers (TikTok / Instagram / YouTube) avec `authorize_url`, `token_url`, `console_url`, `doc_url`, `scopes`, `required_env`, `redirect_var`.
  - `GET /api/ai/share/oauth/setup-guide` → snapshot global : `providers={...}` avec `env_status` (boolean per env-var, **JAMAIS la valeur**), `missing`, `ready`, `redirect_uri_configured`. Test `test_oauth_secrets_never_exposed_in_payload` vérifie aucune fuite.
  - `GET /api/ai/share/oauth/{provider}` → snapshot ciblé ; provider inconnu → **404** (REST-correct).
  - Note explicite dans la réponse : *"RIBA reads OAuth credentials strictly from the environment. Never paste secrets into the UI."*
- **🌐 i18n complet** : top-level `midi.*` (5 clés : `learnNext`, `unbind`, `cancel`, `armed`, `saved`) en **EN / FR / ES / PT / SW**. Verrouillé par `test_locale_coverage.py` (parité ≥ 5 locales × 5 clés = 25 garanties).
- **📊 Tests** : **+21 tests nets** (185 → **206 PASS**) :
  - `test_midi_learn.py` (14 tests) : create-first / incremental / overwrite / owner-mismatch (400) / 5 cas 422 / unbind ciblé / full reset / persistance reload.
  - `test_oauth_prep.py` (7 tests) : shape des 3 providers / secret-leak guard / 404 inconnu.
  - `test_locale_coverage.py` étendu : nouvelle catégorie top-level `midi` parmi `REQUIRED_KEYS`.
- **🎬 Smoke UI validé** : right-click → menu ouvert → Learn → `data-midi-armed='true'` + pill rendue → Cancel → état nettoyé. 4 menus distincts vérifiés ouverts sur 5 wraps. Aucune erreur console JS.

### v3.8 (iter 29 - Feb 2026) — WEBMIDI INPUT 🎹 (Premier contrôle matériel)
- **🎹 WebMIDI Engine** (`/app/frontend/src/hooks/useWebMIDI.js` + `/app/frontend/src/lib/midiMapping.js`) :
  - `navigator.requestMIDIAccess({sysex:false})` auto-déclenché à l'ouverture du panneau MIDI ; détection live des `inputs` / `outputs` USB (claviers maîtres, pads, surfaces de contrôle) avec `onstatechange` qui rafraîchit la liste sans reload.
  - Décodeur MIDI pur (`decodeMidiMessage`) : note-on / note-off / CC / pitch-bend ; les status bytes non-data (clock, sysex) sont ignorés proprement → zéro crash en présence d'un MPK mini, Launchkey, etc.
  - **Mapping factory** : 5 notes transport (60→Play, 61→Stop, 62→Record, 63→Loop, 64→Metronome) + 6 CCs macro (CC16→tempo 40-240 BPM, CC17→Bantu Swing %, CC18→Swing ON/OFF, CC19→style Bantu sur les 5 grooves, CC7→volume master, CC1→pan master).
- **🎯 Transport & Grille Bantu live** (Daw.jsx → `midiDispatchRef`) :
  - Touches physiques mappées à `playAll` / `engine.stopAll` / `toggleRecording` / `toggleLoop` / `toggleMetronome`.
  - Molettes/potentiomètres → `setTempo` (ccToTempo), `setBantuSwingIntensity` (auto-active le swing si > 0), `setBantuStyle` (ccToStyle bucket sur les 5 grooves), `setMasterVol` + pan track sélectionné.
  - **Capture low-latency** : les notes libres jouées sur un clavier branché atterrissent dans le MIDI track sélectionné après quantisation `quantizeBeatToBantu` calée sur le swing/style actifs (Bikutsi 4/4, 6/8, 12/24, Makossa, Asiko) — alignement live sans quantize destructif post-coup.
- **🛠️ SetupModal · onglet MIDI** (`/app/frontend/src/components/daw/modals/SetupModal.jsx`) :
  - 4 onglets : Playback / I/O / **MIDI** / Preferences avec `data-testid='setup-tab-midi'`.
  - Panneau `setup-midi-panel` : statut WebMIDI (`Available / Not available`), permission (Granted/Denied/Idle), bouton **Detect MIDI devices** (`setup-midi-request-access`), liste des inputs avec dot d'activité 9 px (vert pulsant 220 ms à chaque message), liste des outputs, indicateur **Last incoming signal** (note-on/CC/pitch-bend décodé en temps réel), et **carte de référence du mapping** (11 lignes).
  - Menu PT : **Setup → MIDI Input...** (`openMidi` → ouvre le panneau + `requestAccess()`).
- **🌐 i18n complet** : 25 nouvelles clés `setup.midi.*` (support, supportedYes, supportedNo, permission, granted, denied, idle, requestAccess, devicesLabel, outputsLabel, noInputs, lastEvent, lastEventEmpty, mappingLabel, action{Play,Stop,Record,Loop,Metronome,Tempo,SwingIntensity,SwingEnable,SwingStyle,Volume,Pan}, note) + 4 labels d'onglets (playbackTab, ioTab, midiTab, preferencesTab) traduits dans **EN / FR / ES / PT / SW** (script `/tmp/inject_midi_i18n.py`). Le test `test_locale_coverage.py` exige désormais ces clés sur les 5 locales → garde-fou de régression CI.
- **🔧 Backend** (`/app/backend/ai/midi.py`) : router `/api/midi/*` léger (analytics + mappings persistés) :
  - `GET /api/midi/status` → capacités (5 transport actions, 6 macros, 5 styles, tempo_range [40,240], low_latency_target_ms=12).
  - `GET /api/midi/mapping/default` → factory map (notes + cc + styles + tempo_range).
  - `POST /api/midi/mapping` → upsert par owner (`^[A-Za-z0-9_-]{1,48}$`, pitch 0..127, CC 0..127, actions ≤ 64 chars).
  - `GET /api/midi/mapping/{owner}` → recall ou fallback factory si owner inconnu.
  - `POST /api/midi/session` → log d'une take (device_name, event/note/cc counts, duration_ms, bantu_style ∈ 5, tempo, swing_intensity, avg_latency_ms).
  - `GET /api/midi/session/recent` → derniers takes (clampé ≤ 100 côté serveur).
- **📊 Tests** : `test_midi.py` ajoute **21 tests** (status, default mapping shape, save/recall roundtrip, fallback unknown owner, 6 invalid-owner parametrize, range checks pitch + CC, path-level validation, session full + minimal + bad style, recent list + limit clamp, helpers `_cc_to_tempo` / `_cc_to_pan` / `_slice_style`). Locale parity étendu à `setup.midi.*` + 4 tab labels = +3 tests. **185/185 PASS** (164 → 185, +21 net, **0 régression**).
- **🎬 Smoke UI** : Setup → MIDI Input... ouvre le modal sur l'onglet MIDI ; les 7 data-testid (`setup-midi-panel`, `setup-tab-midi`, `setup-midi-request-access`, `setup-midi-support`, `setup-midi-permission`, `setup-midi-no-event`, `setup-midi-no-inputs`) sont présents ; default control map intégralement rendu ; chemin permission-denied gère gracieusement (aucune exception JS).

### v3.7 (iter 28 - Feb 2026) — LIBRARY v2 (Likes/Comments/Griot Profile) + HEATMAP DIASPORA 🌍❤️💬
- **❤️ Likes** : `POST /api/storytelling/library/{id}/like` (toggle idempotent par `X-Client-Id`), `GET /like-status`. Anti-spam : `like_clients` plafonné à 50k entries.
- **💬 Commentaires modérés** :
  - `GET /api/storytelling/library/{id}/comments` (filtre `approved=true` si `RIBA_MODERATE_COMMENTS=true`).
  - `POST /comments` : sanitization HTML/brackets, retourne `author_token` one-shot pour suppression future.
  - `DELETE /comments/{cid}` : supporte `X-Author-Token` (auteur) OU `X-Curator-Token` (curateur global).
- **👤 Griot Profile** : `GET /api/storytelling/griot/{name}` agrège records, total_plays, total_likes, langues, top_style et **8 badges** (`first_record`, `storyteller`, `master_griot`, `voice_of_the_diaspora`, `hall_of_phoenix`, `beloved`, `polyglot`, `curator_pick`).
- **🌍 Diaspora Heatmap** : `GET /api/storytelling/library/heatmap` agrège publications par langue → région (Yaoundé/Brooklyn/Madrid/São Paulo/Nairobi) avec lat/lng + couleur palette. Frontend `BantuHeatmap.jsx` rend une carte SVG stylisée 1000×500 avec silhouettes de continents, Phoenix radial au centre (pulsation 3s), et cercles incandescents pulsants colorés par région (intensité ∝ count).
- **Frontend** (`BantuStorytellingLibrary.jsx` enrichi) : bouton **🌍 Heatmap** toggle + `LibraryLikeButton` (★ 1) + `LibraryCommentsPanel` (inline) + click sur `author_name` → `GriotProfileModal` avec stats blocks, badges 🏅 et grille 30 records récents.
- **i18n complet** : 12 nouvelles clés `library.{heatmapBtn, heatmapTitle, heatmapEmpty, comments, commentsEmpty, commentPlaceholder, griotLabel, griotNotFound, griotRecords, griotPlays, griotLikes, griotTopStyle, griotLanguages, griotRecent}` × 5 langues.
- **📊 Tests** : `test_library_v2.py` 11 nouveaux tests (4 likes idempotents + dedup + status, 4 comments sanitize + auth-protected delete, 2 griot aggregate + 404, 1 heatmap shape). **164/164 PASS** (était 153, 0 régression).
- **Smoke E2E Playwright** ✅ : heatmap SVG affiche pulsation FR sur Yaoundé, Griot profile "Mbomo · Yaoundé" avec badge FIRST_RECORD + 3 records, Like ★1 actif, Comments panel inline "Be the first to speak".

### v3.6 (iter 27 - Feb 2026) — LAUNCH VISUALS + #MVETTWORLDWIDE BADGE 🏆🎨
- **🎨 Procedural Launch Day Visuals** (`/app/backend/setup_icons.py` étendu) :
  - `make_launch_pack(master, out_dir)` génère 4 visuels promotionnels en Pillow direct depuis le master Phoenix 1024² :
    - `launch_hero_2048x1152.png` (YouTube cover · Twitter pinned · Product Hunt banner) — Phoenix radial gradient indigo→violet→magenta + headline "RIBA · FIRST BANTU DAW".
    - `launch_grid_1080x1080.png` (Instagram feed · Spotify Canvas) — Phoenix + 4 bandes chapitres cyan/ambre/magenta/vert.
    - `launch_story_1080x1920.png` (TikTok · Reels · Stories) — pillar vertical avec Phoenix au-dessus + Bantu Grid markers asymétriques en bas.
    - `launch_dev_2400x1260.png` (GitHub social preview · blog header) — Phoenix latéral + slogan "Open by design. Bantu by root."
  - Tous générés en un appel `python backend/setup_icons.py` ; sortie dans `/app/frontend/public/launch/`.
  - Helpers internes : `_gradient_bg()` (radial ou vertical avec punch magenta), `_draw_text_block()` (auto-loadDejaVu fallback), `_composite_launch()` (one switch par layout).
- **🏆 Badge #MvettWorldwide "Featured this month"** :
  - Backend `GET /api/storytelling/library/featured?limit=N` : retourne le mois courant `YYYY-MM`, hashtag `#MvettWorldwide`, et un mélange (curator-flagged via `is_featured=True` en priorité, sinon top-plays des 30 derniers jours). Tag automatique `badge: "featured" | "trending"` injecté sur chaque item retourné.
  - Backend `POST /api/storytelling/library/{id}/feature?enabled=true` : endpoint curateur protégé par `RIBA_CURATOR_TOKEN` env var + `X-Curator-Token` header. Désactivé (403) tant que la variable d'env n'est pas configurée.
  - Frontend `BantuStorytellingLibrary.jsx` :
    - **Spotlight strip** en haut du panel : bandeau or/magenta `🏆 #MvettWorldwide · Featured this month · top N` avec scroll horizontal de 3 cartes featured cliquables (chaque carte porte un badge pill `★ FEATURED` ou `↑ TRENDING`).
    - **Badge corner-stamp** sur chaque card de la grille principale (`data-testid="library-badge-{id}"`) : pill gradient ambre→magenta pour `★ FEAT` curé, ou cyan→indigo pour `↑ TREND`, avec glow et bordure colorée appliquée à la carte entière.
  - Clé i18n `library.featuredTitle` ajoutée dans les 5 langues (FR/EN/ES/PT/SW).
- **📊 Tests** :
  - `test_launch_visuals.py` (2 tests) : présence + dimensions byte-exact des 4 PNG.
  - `test_featured_curation.py` (5 tests) : shape de `/featured`, limit param, trending auto-inclusion, curator 403 sans token et avec mauvais token.
  - **153/153 PASS** (était 146, +7 nouveaux, 0 régression).
- **Smoke E2E Playwright** ✅ : spotlight strip rendu, 3 cartes Trending visibles dans le grid principal avec badge stamp, hashtag affiché en uppercase doré.

### v3.5 (iter 26 - Feb 2026) — BANTU STORYTELLING LIBRARY + LAUNCH KIT 🌍📖🚀
- **🌍 Bantu Storytelling Library** — premier réseau social de griots numériques :
  - Backend `/app/backend/ai/library.py` : collection MongoDB `storytelling_library`. Endpoints :
    - `POST /api/storytelling/library` — publication validée (langue ∈ {fr,en,es,pt,sw}, style ∈ {asiko_wisdom, makossa_roots, bikutsi_44/68/1224}, 4 chapitres contigus 1..total_bars, arrangement_hint ∈ allowed set, lyrics 2-64). Retourne `id` public + `author_token` (montré une seule fois).
    - `GET /api/storytelling/library?lang=&style=&q=&sort=recent|popular|random&limit=&offset=` — browse paginé avec filtres et recherche full-text (titre/thème/auteur).
    - `GET /api/storytelling/library/{id}` — fetch complet + incrément atomique `plays`.
    - `DELETE /api/storytelling/library/{id}` — protégé par header `X-Author-Token`.
    - `GET /api/storytelling/library/stats` — total + breakdown par langue + par style.
  - `_serialize_public()` strip systématiquement `author_token` + `_id` Mongo de toutes les réponses publiques (zéro fuite).
  - Frontend `BantuStorytellingLibrary.jsx` : panel filtré (6 pills langue + 6 pills style + tri recent/popular/random + recherche live + bouton refresh), grille de cartes avec mini-timeline 4-couleurs (cyan/ambre/magenta/vert), nom auteur, play-count, bouton **LOAD** qui injecte l'arrangement dans le preview pane de la modale.
  - `BantuStorytellingModal.jsx` refondu avec 2 onglets (**✨ Generate** + **🌍 Library**) + nouveau bouton **🌍 Publish to Library** (saisie du nom de griot) qui post le récit + affiche le `author_token` à conserver.
  - i18n complet en 5 langues : `library.{searchPlaceholder, results, empty, loadBtn, publishBtn, publishedTitle, publishedHint, authorPlaceholder}` + `storytelling.{tabGenerate, tabLibrary}`.
- **🚀 Launch Day Kit** (`/app/docs/LAUNCH_DAY_KIT.md`) :
  - **One-pager presse** complet (headline · lede 60 mots · 3 différenciateurs · pull-quote · boilerplate 50 mots).
  - **Script YouTube Live** 45 min (3 villes Yaoundé ↔ Paris ↔ Brooklyn, cold open, 3 actes, outro, checklist OBS).
  - **4 visuels promotionnels** spécifiés (hero 2048×1152 · square 1080² · vertical 1080×1920 · dev 2400×1260) avec palette Phoenix et copy par visuel.
  - **Checklist semaine de lancement** J-3 → J+1 (tag GitHub, QA, presse, social).
- **📊 Tests** : `test_storytelling_library.py` (16 tests : stats shape, publication validée, rejets 400/422 sur langue/style/contiguity/title/hint, browse default+lang+style+search+pagination, fetch increments plays, delete auth-token-protected) → **146/146 PASS** (était 130, +16 nouveaux, 0 régression).
- **Smoke E2E Playwright** ✅ : 3 récits seedés affichés dans la grille, LOAD → preview rempli avec 4 chapitres + lyrics + bouton Apply visible.

### v3.4 (iter 25 - Feb 2026) — TAURI DESKTOP + MULTILINGUAL MANUAL + i18n FULL 💻📚🌍
- **💻 Tauri Desktop Release Pipeline** (CI-driven, Tauri 2.x) :
  - `/app/.github/workflows/release.yml` : matrice 4 runners (macos aarch64 + x86_64, windows-latest, ubuntu-22.04) déclenchée par tag `v*.*.*` ou `workflow_dispatch`. Produit `.exe (NSIS)`, `.msi`, `.dmg (Apple Silicon + Intel)`, `.deb`, `.AppImage` en draft GitHub Release.
  - `src-tauri/tauri.conf.json` + `Cargo.toml` bumpés à `3.4.0`, identifier `com.emergent.riba`.
  - **🔥 Icônes Phoenix natives** générées par `backend/setup_icons.py` (extension v3.4) : `icon.ico` multi-résolution (16/24/32/48/64/128/256), `icon.icns` Apple natif (Pillow ICNS writer), `icon.png` 512², 128x128.png, 128x128@2x.png, 32x32.png. Toutes installées dans `src-tauri/icons/`.
  - **Code signing hooks** prêts (Apple cert + Tauri updater) — commenter/décommenter les secrets dans le YAML.
  - Guide complet utilisateur dans `/app/DESKTOP_RELEASE.md` (prérequis, secrets, push tag, output artifacts).
- **📚 Manuel utilisateur riche multilingue** :
  - `ManualModal.jsx` totalement refondu en layout 2 colonnes : **nav latéral 5 sections** (🔥 Philosophy · 🥁 Bantu Oral Grid · ✨ Magic Generator AI · 🌐 Studio Live · 📡 Virality) + **panneau contenu** (intro + bullets thématiques + Tip block Phoenix-magenta).
  - **34 bullets de contenu** par langue × 5 langues = 170 traductions natives (FR/EN/ES/PT/SW) intégrées dans `/app/frontend/src/locales/*.json`.
  - **Bouton 📖 Manual** ajouté dans la `MenuBar.jsx` (pill magenta avec mini-logo Phoenix circulaire) à côté du Globe Switcher.
- **🌍 i18n extension aux modales restantes** :
  - `BantuGridModal.jsx`, `MagicGeneratorModal.jsx`, `MagicRemixModal.jsx`, `AssistantModal.jsx`, `SetupModal.jsx` : titres + labels clés branchés sur `t('<scope>.title|...')`.
  - Nouveaux scopes ajoutés aux 5 bundles : `bantuGrid`, `magicGen`, `magicRemix`, `albumBuilder`, `setup`, `assistant` (couvrent : titles, tabs, key inputs, action buttons).
- **📊 Robustesse** :
  - `test_tauri_release.py` (4 tests) : validation `tauri.conf.json` JSON valide + version bumpée, Phoenix icons présents + non-vides, workflow `release.yml` couvre les 3 OS + 4 cibles + Tauri action.
  - `test_locale_coverage.py` (3 tests) : parité des **70+ clés requises** sur les 5 langues — bullets manual, modales, common — chaque clé manquante = test échoué.
  - **130/130 PASS** (était 123, +7 nouveaux : 4 Tauri + 3 i18n parity, 0 régression).
- **Validation smoke Playwright** ✅ : Manual button cliquable depuis la TopBar, 5 sections nav rendues, navigation entre sections, tips block visible, switch FR/SW change l'intégralité du contenu byte-exact.

### v3.3 (iter 24 - Feb 2026) — STUDIO LIVE COMPLET + BANTU STORYTELLING 🌐📖🔥
- **🌐 Studio Live multi-onglets** (Y.js + WebSocket relay) :
  - Sync mixeur étendu : `tempo`, `masterVol`, `bantuStyle`, `bantuDensity`, `bantuBars`, `bantuSwingEnabled`, `bantuSwingIntensity`, `showBantuMarkers`, `storyChapters`, et **per-track** via `trackMix.{id}.{volume,pan,isMute,isSolo}`.
  - Anti-écho via `applyingRemoteRef` (flag) pendant la phase apply pour empêcher les boucles infinies remote↔local.
  - `useStudioLive.setCursor()` throttle 50ms (avec coalesce du dernier état) + flush différé pour respecter la latence sans perdre la dernière position.
  - `LiveCursorOverlay` : curseurs colorés (couleur attribuée par client + label nom) absolus dans la Timeline avec transition CSS 60ms.
  - `StudioLiveBadge` enrichi : avatars circulaires monogrammes avec `tooltip` et animation `riba-avatar-pulse` (1.6s ease-in-out) quand le collaborateur édite (cursor actif).
- **📖 Bantu Storytelling — Module Mvett complet** :
  - Backend `POST /api/ai/storytelling` (Claude Sonnet 4.6 via Emergent LLM Key) : génère un récit en 4 chapitres canoniques (`intro`/`defi`/`combat`/`sagesse`) avec `marker_label`, `bar_start`/`bar_end` contigus, `tempo_target` [40-240], `swing_intensity` [0-1], `arrangement_hint` ∈ {solo_drum, swing_accel, swing_decel, vocal_chant, polyrhythm_drop, tempo_climb, tempo_release, silence_break}, `narration` 1-2 phrases, et `lyrics[]` 4-16 lignes. Validation stricte (`_coerce_and_validate`) + fallback déterministe par langue (fr/en/es/pt/sw) garantissant le même shape contract si LLM HS.
  - Backend `GET /api/ai/storytelling-status` : health probe (no LLM cost) avec enums alignées sur le frontend.
  - Frontend `BantuStorytellingModal.jsx` accessible depuis le menu Event ; UI 3-panneaux (form → résultat 4 cartes par chapitre → lyrics block) + bouton "Apply to Timeline" qui injecte chapters/style/swing dans le state ET broadcast Y.Map.
  - **🔥 Impact audio réel** : `handlePlayheadChange` interpole tempo + swing **dynamiquement** au passage des chapitres (cross-fade sur les derniers 25% de chaque segment pour une transition musicale fluide) → l'audio raconte réellement l'histoire.
  - Bandes colorées (cyan/ambre/magenta/vert) sur la Timeline pour visualiser les 4 chapitres avec marker labels.
- **📊 Robustesse** : `test_storytelling.py` (11 tests) + `test_studio_live.py` (6 tests, dont broadcast binaire/text, no-echo sender, session purge on last-peer leave) → **123/123 PASS** (était 106, +17 nouveaux tests, 0 régression).
- **🌍 i18n complet** : clés `storytelling.*` ajoutées dans `fr/en/es/pt/sw.json`.
- **Validation par testing_agent_v3_fork (iteration_17)** : 100% PASS backend (122 + 1 slow deselected), 100% PASS frontend (menu, modal, génération LLM ~10s, 4 chapitres, apply, bandes Timeline, multi-onglets sync tempo/grid/swing/master, badge peers=2, avatars actifs, broadcast curseur).

### v3.2 (iter 23 - Feb 2026) — PHOENIX LOGO + i18N 5 LANGUES 🌍🔥
- **🔥 Logo Phoenix procédural** : `/app/backend/setup_icons.py` génère un Phénix stylisé (bleu profond `#0F1138`, violet électrique `#6366F1`, magenta néon `#D946EF`, ambre `#F59E0B`) en `Pillow`. Outputs : `riba-logo.png` (1024², master), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180²), `favicon.png` (64²), `favicon.ico` (16/32/48/64). Logo intégré dans **TopBar MenuBar**, **SplashScreen**, et **ManualModal**.
- **🌐 i18n complète 5 langues** (`fr` / `en` / `es` / `pt` / `sw`) :
  - `/app/frontend/src/i18n.js` (i18next + `i18next-browser-languagedetector` + `react-i18next`) avec persistance localStorage (`riba-lang`) et synchronisation `document.documentElement.lang`.
  - Bundles JSON `/app/frontend/src/locales/{fr,en,es,pt,sw}.json` — couvrent : menu Pro Tools, splash boot lines, cinematic subtitles, ManualModal, common UI.
  - **🌐 LanguageSwitcher** (`/app/frontend/src/components/daw/LanguageSwitcher.jsx`) : pill dropdown avec drapeau emoji + label natif + code ISO ; positionné dans le coin droit de la `MenuBar`.
  - `MenuBar.jsx` rend les titres avec `t('menu.<key>')`, `SplashScreen.jsx` traduit boot status + cinematic subtitles dynamiquement (re-render au switch live), `ManualModal.jsx` 100% i18n.
- **🤖 Endpoint AI Translate** (`/app/backend/ai/translate.py`) :
  - `GET /api/ai/translate-status` — quick health probe (no LLM cost), retourne `{enabled, provider, languages:[fr,en,es,pt,sw,de,it]}`.
  - `POST /api/ai/translate` — traduction single via Claude Sonnet 4.6 (Emergent LLM Key). Fallback gracieux (identité) si la clé est absente ou le budget épuisé.
  - `POST /api/ai/translate-batch` — traduction d'un dict `key→text` en un seul appel JSON pour les bundles dynamiques (descriptions Bantu, tutoriels).
- **Tests pytest** : `test_translate.py` 5 nouveaux tests passants → **106/106 PASS** (était 100/100, 0 régression).
- **Smoke test E2E Playwright** ✅ : switch FR→SW vérifié, menu basculé en `Fichier/Édition/...` et `Faili/Hariri/...` byte-exact ; logo Phoenix visible dans la TopBar (boxShadow magenta + cyan).

## Prioritized Backlog
- **P0 (v3.8)**: Auto-share OAuth — finir TikTok/IG/YT publication réelle (les tokens env vars sont prêts dans share.py).
- **P1**: Curator UI — toggle ★ FEATURED depuis l'interface (nécessite `RIBA_CURATOR_TOKEN` configuré).
- **P1**: WebMIDI input.
- **P1**: Code-signing macOS + EV cert Windows.
- **P2**: Vue Bantu Heatmap audio (preview des hints).
- **P2**: Refactor `engine.js` en React hooks.
- **P2**: Extraire `_build_bantu_grid` en module partagé.
- **P2**: Snippet preview audio inline.
- **P2**: Comments — système de signalement/modération avancée.
- **P2**: Likes — leaderboard top-100 globe.
- **P2**: Profil Griot — page route dédiée `/griot/:name` (actuellement uniquement modale).
- **P2**: Tauri updater integration.

## Next Action Items
- 🟢 Sprint v3.8 — choix utilisateur :
  - **a) Auto-share OAuth complet** (TikTok/IG/YT publication réelle)
  - **b) Curator UI** (toggle ★ FEATURED depuis l'interface)
  - **c) WebMIDI input** pour claviers externes
  - **d) Leaderboard #MvettWorldwide** (top-100 globe par plays/likes)
  - **e) Comments — signalement + modération avancée**
- 🔥 **Statut Build natif v3.5.0** : pipeline lancé. Vérifie la page GitHub Releases pour `.exe + .dmg + .AppImage`.
- ⚠️ Activer curation : `RIBA_CURATOR_TOKEN=...` dans `.env`. Activer modération comments : `RIBA_MODERATE_COMMENTS=true`.
- ⚠️ Activer Auto-share : tokens TIKTOK/IG/YT dans `.env`.
