---
name: motion-promo-video
description: >
  Create polished motion-design promo videos (ads, launch teasers, Reels/TikTok/Shorts, product
  videos) for any software product — app, SaaS, game, website, dashboard — starting from its code
  repository, a plain-text description, or just screenshots/prints of the system. Produces a
  1080x1920 (or 16:9 / 1:1) MP4 at 60 fps with kinetic typography, the product's real UI elements
  floating as 3D cards/buttons, cursor interactions, camera moves and a synced synthesized soundtrack
  with sound effects — rendered deterministically (HTML + GSAP captured frame by frame + FFmpeg).
  Use this skill whenever the user asks for a promo/promotional video, video ad, "vídeo de propaganda",
  "vídeo promocional", teaser, launch video, product demo animation, motion design of their system,
  an animated video for Instagram/Reels/TikTok/YouTube Shorts/LinkedIn, or says things like "make a
  video of this screen/print", "transforma meu sistema num vídeo", even if they don't say "motion design".
  Not for editing existing footage, talking-head/AI-avatar videos or photorealistic AI video generation.
---

# Motion Promo Video

Turn a product into a short, punchy motion-design ad: bold headlines on a clean background, the
product's key UI pieces (cards, buttons, badges, charts, screenshots) flying in with depth and
personality, a cursor that clicks and drags, and a soundtrack whose every whoosh and pop lands on
the frame it belongs to. Everything is a pure function of time, so renders are exact and repeatable.

**The default look** (validated with real users): white background, huge display type revealed through
masks with a highlighter swipe on the key words, isolated UI elements — *not* full app screens (full
screens read as a screen recording and feel "frozen"), constant subtle motion, match cuts between
scenes, and a logo + CTA held at the end. Offer a dark variant only if the brand is dark-first.

## How the pieces fit

```
scripts/doctor.mjs     check deps (Node, Playwright + Chromium, GSAP, FFmpeg) — prints fix commands
scripts/new.mjs        scaffold a project (scene.html demo + preview + assets) — --format 9:16|16:9|1:1|4:5
scripts/fonts.mjs      fetch Google Fonts, or pull the exact @font-face from a running app (--from-url)
scripts/palette.mjs    palette + suggested tokens from a screenshot
scripts/crop.mjs       cut pieces out of a screenshot (--grid to read coordinates, --info for size)
scripts/preview.mjs    serve the project → preview.html with scrubber (instant iteration, no render)
scripts/render.mjs     frames → MP4 + soundtrack; --draft → out/contact.draft.png; --still 5.1,7.5 → exact frames
runtime/motion.js      the motion API used by the scene (copied into each project)
```

Run scripts with `node "<skill-dir>/scripts/<name>.mjs" …`. The project folder is self-contained.

## Workflow

### 0. Setup (once per machine)
Run `node <skill>/scripts/doctor.mjs`. If npm packages are missing, run `npm install` inside the skill
folder. For system software (FFmpeg) or the Chromium download, show the printed command and ask the
user before installing — they may prefer another method.

### 1. Intake — understand the product and the one message
Figure out which inputs you have (any mix works):
- **Repository** → read it for product purpose, brand tokens, fonts, logo, key components and flows.
- **Running app / URL** → screenshots with Playwright; `fonts.mjs --from-url` grabs the real fonts.
- **Screenshots / prints / photos of an object** → look at them carefully; `palette.mjs` for colors,
  `crop.mjs --grid` + `crop.mjs x,y,w,h` to cut UI pieces you want to show as floating cards.
- **Only a description** → build the brand from what they tell you; ask for logo/colors if they have them.

Then make sure you know these. Anything not inferable → ask, **in one batch** (AskUserQuestion, ≤4
questions, recommended option first), never drip-feed questions:

| Need | Default if the user doesn't care |
|---|---|
| What the product is + who it's for | — (must know; ask) |
| The single message / promise of the video | derive from the product's value prop, confirm in the storyboard |
| 3–4 key moments or features to show | the product's core loop/flow |
| CTA text and destination (URL, store, "link in bio") | "Try it free" / "Teste grátis" |
| Format & platform | 9:16 1080x1920 (Reels/TikTok/Shorts) |
| Language(s) of on-screen text | the user's language (pt-BR with correct accents if Portuguese) |
| Duration | 15–18 s |
| Sound | synthesized soundtrack + SFX (or their own track via `--music`, or silent) |

Never invent facts about the product (metrics, awards, prices, customer names). Numbers in the video
must come from the user or be clearly illustrative UI data (e.g., a sample task list). If the user
says "just do it", go with the defaults and state them in one line.

### 2. Brand & objects
Read `references/brand-and-inputs.md` for how to extract tokens per input type. Output of this step:
- tokens (paper, ink, brand, accent, radius, display + body fonts) → section 1 of `scene.html`;
- a list of 5–10 **objects** to animate: the product's signature UI pieces (a card, a button, a badge,
  a chart, a status pill, a player card…), the logo, and optionally 1–2 screenshot crops.

### 3. Storyboard (quick OK from the user)
Read `references/storyboard.md`. Present a table (time · scene · what happens · camera · on-screen
text). 6–8 scenes, one idea each, a cut or focus change every 1.5–3 s, payoff moment with the music
drop, logo + CTA held ≥ 1.5 s. Wait for OK unless the user pre-approved ("pode fazer direto").

### 4. Build the scene
```
node <skill>/scripts/new.mjs <project-dir> --format 9:16 --fonts "Display Font:700,800" "Body Font:400,600"
```
The generated `scene.html` is a working demo — replace, don't append. Edit in this order:
1. **Tokens** (section 1) and fonts in `Motion.init({ fonts })`.
2. **Markup**: one `<section class="scene">` per storyboard scene; objects from the component kit
   (`references/components.md`) or `<img class="shot">` crops. Wrap floating objects in `.fl`.
3. **COPY** (section 4): every visible string, per language; `*word*` gets the highlighter.
4. **Timeline** (section 5) with the Motion API — `references/motion-api.md`. Every helper schedules
   its own sound, so the soundtrack stays in sync automatically; mark the payoff with `M.impact(t)`
   and the logo with `M.brandHit(t)`, finish with `M.end(t, 1.6)`.

To check a detail, grab exact frames: `render.mjs <project> --still 3.2,5.8` (seconds) → `out/stills/` — takes
seconds, no video. (`preview.mjs` gives the human a scrubber; you can't use it, so use `--still`.)

### 5. Draft → look → fix → final
```
node <skill>/scripts/render.mjs <project-dir> --draft     # ~15 s: 6 fps + out/contact.draft.png
```
**Open `out/contact.draft.png` and actually look at it** (plus single frames in `out/review/` when in
doubt). Review frames are added automatically after every headline, reveal, impact and the logo; if a
storyboard beat has no frame, add `M.review("name", t)`. Draft frames snap to 1/6 s — use `--still` for
exact moments. Check: text cut off or overlapping objects, wrong font, elements outside the safe area,
empty frames at cuts, leftovers from a previous scene, cursor hidden, CTA readable. Fix, redraft.
The renderer fails on non-deterministic code and missing font faces/weights, and warns about frozen
stretches, clipped headline lines and text outside the safe area (read those warnings — most are real).

Then the final render (60 fps, ~2–4 min for 15 s):
```
node <skill>/scripts/render.mjs <project-dir>            # out/<name>.mp4 + out/contact.png + out/report.json
node <skill>/scripts/render.mjs <project-dir> --lang en  # other language, same timeline
```

### 6. Deliver
Give the MP4 path (send the file if a file tool exists), the contact sheet, duration/format/loudness
from `report.json`, and one line on what to tweak next. Offer variants: other language, 16:9/1:1
version, alternative CTA, the user's own music (`--music track.mp3`). Mention honestly that you
can't listen to audio — you checked levels, not taste.

## Quality bar (why each rule exists)

- **Isolated objects on a clean background, not full screens** — screens look like a recording and
  have no focal point; objects let the camera and typography tell the story.
- **Nothing is ever static** — `M.idle`, `M.breathe` and the background drift keep every frame alive;
  the renderer flags identical consecutive frames before the final hold.
- **One idea per scene, text ≤ 5 words per line, ≥ 90 px** — people watch without sound, on a phone,
  for 2 seconds per scene.
- **Geometry is pre-animation** — `M.rect`/`M.measure` read a layout snapshot taken before `build()`, so
  entrance tweens can't skew positions. Elements you create inside `build` are measured live — measure
  them before tweening them.
- **Scenes that start hidden use `fromTo`/`M.show`, never `from({autoAlpha:0})`** (animates 0 → 0).
- **Determinism** — no `Math.random`, `Date.now`, timers or CSS animations in the scene; use
  `Motion.prng(seed)`. Same input, same video — which is what makes iteration by prompt reliable.
- **Safe areas (9:16)** — keep text and CTA between y≈250 and y≈1560, x≈60–1020 (platform UI).
- **Real brand** — real fonts (fallback fonts fail the render), real colors, real logo when available.

## References (read when needed)
- `references/brand-and-inputs.md` — extracting tokens, fonts and objects from repo / URL / screenshots / text.
- `references/storyboard.md` — ad structure, timing, copy rules, formats and safe areas, storyboard template.
- `references/motion-api.md` — full `motion.js` API with recipes (drag & drop, match cut, circle transitions, counters).
- `references/components.md` — component kit, rebuilding UI pieces, screenshot cards, 3D flip cards.
- `references/audio.md` — sound cues, music parameters, custom tracks, loudness.
- `references/troubleshooting.md` — known pitfalls and their fixes.
- `references/example-peneira.md` — a complete real case (football game), from storyboard to final code.
