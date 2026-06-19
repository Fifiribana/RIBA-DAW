# 🔥 RIBA Launch Day Kit · v3.5 — "First Bantu DAW"

A turnkey kit to coordinate the world première of RIBA Desktop and the
opening of the Bantu Storytelling Library — the first numerical griot
social network.

---

## 1 · Press One-pager

> **Use as-is** for your press release, distributor outreach, App Store
> listing and Product Hunt launch. Adapt the hero quote and dateline.

### Headline
> **RIBA · The First Cultural DAW — Bantu Oral Grid, Native, on Desktop.**

### Dateline
> Yaoundé · Brooklyn · Paris — `<DATE>`

### Lede (60 words)
> Today, Emergent Labs releases **RIBA**, a Digital Audio Workstation built
> around an exclusive, world-first innovation: the **Bantu Oral Grid** — an
> asymmetric quantization engine that encodes the oral grooves of Central
> Africa (Asiko · Makossa · Bikutsi). It runs on Windows, macOS and Linux,
> ships with five native languages, and connects musicians via collaborative
> live sessions and a global storytelling library.

### Three differentiators (each ≤ 30 words)
1. **Bantu Oral Grid** — the only DAW in the world coding ternary swing
   (55–65 %), 6/8 cycles and 12/24 polyrhythms as **first-class citizens**,
   not as Western-quantize fudges.
2. **Studio Live Session** — sub-50 ms WebRTC + Y.js sync of mixer, swing,
   tempo and cursors. A griot in Yaoundé and a producer in Brooklyn jam on
   the same timeline, in real time, for free.
3. **Bantu Storytelling Library** — a community-published catalog of Mvett
   arrangements (intro · défi · combat · sagesse) loadable in one click.
   The first griot social network.

### Tech credits
- Tauri 2.x desktop · WebAudio · MongoDB · React 19 · Y.js
- Demucs (htdemucs) · fal.ai stable-audio · Anthropic Claude (Mvett structure)
- Pillow procedural Phoenix logo · ffmpeg viral reels · APScheduler social drops
- 130/130 backend tests · 5 languages (FR · EN · ES · PT · SW)

### Pull-quote (place a real name)
> *« RIBA est la première fois qu’un outil professionnel respecte le
> rythme oral africain comme une donnée native — pas comme une exception
> à corriger. »* — `<Producer name>, <Studio>, <City>`

### Press contact
- press@riba-studio.com (placeholder)
- Demo + interview booking: https://riba-studio.preview.emergentagent.com
- Source-of-truth changelog: `/app/memory/PRD.md`

### Boilerplate (50 words)
> RIBA is a Digital Audio Workstation engineered by Emergent Labs to
> preserve and propagate African oral rhythms. With its Bantu Oral Grid,
> built-in AI Mvett storytelling, and free collaborative sessions,
> RIBA reconnects diaspora producers from Kinshasa to Brooklyn through a
> single rhythmic language. Open by design, multilingual by birth.

---

## 2 · YouTube Live · Session Script

> **Target duration**: 45 minutes. **Format**: 3-window grid
> (Yaoundé griot · Paris producer · Brooklyn beatmaker) joined by an
> off-screen narrator. Live URL with `?session=launch-day` for
> Studio Live sync.

### Cold open (00:00 → 02:00)
- 8-second cinematic boot (RIBA splash) screen-shared from Paris.
- Narrator off-camera in FR + EN subtitles: *« Bienvenue dans la première
  session live mondiale de RIBA. Trois villes, trois rythmes, une grille
  Bantu. »*
- All three webcams fade in. Phoenix logo overlay in the corner.

### Act 1 · Bantu Oral Grid live demo (02:00 → 12:00)
- **Yaoundé** shares a 4-bar `bikutsi_68` percussion loop straight off the
  Bantu Grid (60 s).
- **Paris** opens BantuGrid modal, switches to `bikutsi_1224`, density 24
  → real-time Y.js sync ; **Brooklyn** sees the markers move (90 s).
- Free improvisation 6 min — mute / solo / tempo tugged from any peer.
  Narrator captions the swing percentages live.

### Act 2 · Mvett Storytelling (12:00 → 25:00)
- **Yaoundé** types a Wolof proverb in the **Bantu Storytelling** modal.
- Claude returns 4 chapters live; Apply → the 3 tabs all show the 4
  colored bands snap to the timeline.
- **Brooklyn** clicks Play — tempo + swing automate through the 4
  chapters; cameras catch the producers reacting to the climax (combat
  → polyrhythm_drop).

### Act 3 · Library publish + diaspora discovery (25:00 → 38:00)
- **Yaoundé** publishes the Mvett to the global Library with author name
  *« Mbomo, Yaoundé »*. The author_token is visible only on screen.
- **Brooklyn** flips to the **Library tab**, filters `sw` + `bikutsi_68`,
  finds Mbomo's record, loads it, applies on his own timeline.
- Cut to a screen split showing the same story playing on 3 continents,
  synchronized via Studio Live.

### Outro (38:00 → 45:00)
- Each artist drops one closing line in their own language.
- CTA: *« RIBA est en téléchargement à `<release URL>`. La bibliothèque
  est ouverte — chaque récit publié devient un héritage partagé. »*
- 5-second Phoenix splash with the **#FirstBantuDAW** hashtag.

### Camera + audio checklist
- Each musician runs OBS + Studio Live tab side-by-side
- Bantu Reel snippet picker primed for live-tweetable 30 s clips
- Live caption track auto-translated via `/api/ai/translate` to FR · EN ·
  ES · PT · SW (one button toggle on the operator's deck)

---

## 3 · Four promotional visuals (asset list)

The Phoenix logo source is in `/app/frontend/public/riba-logo.png`. Use the
following compositions for the launch artwork. Each block is sized for
the platform; export with the Phoenix radial palette
(deep-indigo `#0F1138` → electric-violet `#6366F1` → neon-magenta `#D946EF`
→ spark-amber `#F59E0B`).

| # | Filename                       | Size       | Use case                                              | Composition                                                                                          |
|---|--------------------------------|------------|-------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| 1 | `launch_hero_2048x1152.png`    | 2048×1152  | YouTube cover, Twitter pinned, Product Hunt banner    | Phoenix logo (center) + headline *"First Bantu DAW · 5 langues · 3 cities · 1 timeline"* + 3 globe arcs (Yaoundé · Paris · Brooklyn) |
| 2 | `launch_grid_1080x1080.png`    | 1080×1080  | Instagram feed, Spotify Canvas                        | Triptych of Mvett chapter bands (intro·défi·combat·sagesse) cyan/amber/magenta/green over deep-indigo |
| 3 | `launch_story_1080x1920.png`   | 1080×1920  | TikTok / Instagram Reels / Story                      | Vertical pillar with the Phoenix rising from a Bantu Oral Grid visualization at the bottom           |
| 4 | `launch_dev_2400x1260.png`     | 2400×1260  | GitHub social preview, blog header                    | Mosaic of code excerpts (`storytelling.py`, `library.py`, `useStudioLive.js`) overlaid with Phoenix watermark |

### Hands-free generation
A future iteration can wire these into `/app/backend/setup_icons.py` by
adding a `make_launch_pack(size, layout)` helper that composes the
Phoenix master with a layered title/glyph using Pillow's `ImageDraw`. For
this Sprint we ship the **asset spec + dimensions**; the design team can
either render manually or trigger Nano-Banana via the existing
integration playbook.

### Suggested copy per visual
- **Hero**:  *RIBA · First Bantu DAW*  /  subtitle: *Studio Live · Mvett Storytelling · 5 Languages*
- **Square**: *Yaoundé ↔ Paris ↔ Brooklyn — One Timeline.*
- **Vertical**: *Each beat is a memory. Each session, a reunion.*
- **Dev**:   *Open by design. Bantu by root. Free to remix.*

---

## 4 · Launch-week checklist

- **Day -3** : `git tag v3.4.0 && git push --tags` → wait for the
  release-desktop GitHub Action to draft the multi-platform installers.
- **Day -2** : QA-pass the .exe, .dmg, .deb on real hardware.
- **Day -1** : Push the One-pager to journalists; ship 4 visuals to
  design partners; warm up Studio Live in `?session=launch-day`.
- **Day 0**  : Publish the GitHub Release. Go live on YouTube. Post the
  hashtag **#FirstBantuDAW** on every social.
- **Day +1** : Aggregate Library stats via `GET /api/storytelling/library/stats`
  and post the first community heatmap.

🔥 *Make the Phoenix rise.*
