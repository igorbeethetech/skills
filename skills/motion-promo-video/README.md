# 🎬 Motion Promo Video Skill

> Turn any software product into a polished motion-design promo video — from its repo, a description, or just a screenshot.

Ask Claude for "a promo video of my app for Reels" and get a **1080x1920, 60 fps MP4** with kinetic
typography, your product's real UI elements floating as 3D cards and buttons, a cursor that clicks and
drags, camera moves, and a **synced soundtrack with sound effects** — all rendered deterministically.

---

## ✨ What does this skill do?

| Input you give | What Claude does |
|---|---|
| A **repository** | Reads brand tokens, fonts, logo and key components; rebuilds the signature UI pieces as animated objects |
| **Screenshots / prints** | Samples the palette, matches the fonts, rebuilds or crops the key elements |
| A **description** | Asks for logo/colors (or proposes a small brand) and designs objects for the core action |

Then it proposes a storyboard (6–8 scenes, a cut every 1.5–3 s, payoff, logo + CTA), builds the scene,
reviews its own frames, and renders the final video with audio.

### Highlights
- ✅ **Product-ad look by default** — white background, huge masked headlines with a highlighter swipe, isolated UI objects with depth (not boring screen recordings)
- ✅ **Deterministic render** — one GSAP timeline captured frame by frame at exact 60 fps; same input, same video
- ✅ **Synced sound, no licensing** — soundtrack + 19 kinds of effects synthesized from the timeline, mastered to −14 LUFS
- ✅ **Self-review** — contact sheet of key frames; the renderer flags frozen frames, fallback fonts and non-deterministic code
- ✅ **Multi-language & multi-format** — `?lang=en` from the same timeline; 9:16, 16:9, 1:1, 4:5
- ✅ **Instant iteration** — preview page with a scrubber; drafts render in seconds

---

## 📦 Requirements

- Node.js ≥ 18
- FFmpeg with libx264 (`winget install --id Gyan.FFmpeg -e` · `brew install ffmpeg` · `apt install ffmpeg`)
- After installing the skill, once: `npm install` and `npx playwright install chromium` inside the skill folder

Run `node scripts/doctor.mjs` inside the skill folder to check everything.

## 🚀 Install

```bash
git clone https://github.com/igorbeethetech/skills.git /tmp/beethetech-skills && \
  mkdir -p ~/.claude/skills && \
  cp -r /tmp/beethetech-skills/skills/motion-promo-video ~/.claude/skills/ && \
  rm -rf /tmp/beethetech-skills && \
  cd ~/.claude/skills/motion-promo-video && npm install && npx playwright install chromium
```

Windows (PowerShell):
```powershell
git clone https://github.com/igorbeethetech/skills.git $env:TEMP\beethetech-skills; `
  New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null; `
  Copy-Item -Recurse "$env:TEMP\beethetech-skills\skills\motion-promo-video" "$HOME\.claude\skills\motion-promo-video"; `
  Remove-Item -Recurse -Force "$env:TEMP\beethetech-skills"; `
  cd "$HOME\.claude\skills\motion-promo-video"; npm install; npx playwright install chromium
```

## 💬 Example prompts

- "Make a 15-second Reels promo for this app" *(inside the repo)*
- "Cria um vídeo promocional do sistema deste print: ./print.png"
- "I need a 16:9 launch teaser for our invoicing SaaS — here are 3 screenshots"
- "Transforma a tela de checkout num vídeo de propaganda, CTA 'Compre agora'"
- "Now render it in English and in 1:1"

If something essential is missing (what the product is, the message, the CTA), Claude asks once, in a single batch of questions.

## 🗂️ Structure

```
motion-promo-video/
├── SKILL.md                 Entry point (workflow Claude follows)
├── README.md
├── package.json             playwright + gsap
├── runtime/motion.js        Motion API: headlines, pop, idle, cursor, drag, match cut, confetti, counters, camera, auto-SFX
├── templates/
│   ├── scene.html           Working demo scene with the component kit (edit, don't start from zero)
│   └── preview.html         Real-time preview with scrubber
├── scripts/
│   ├── doctor.mjs           Dependency check
│   ├── new.mjs              Scaffold a project (--format 9:16|16:9|1:1|4:5)
│   ├── fonts.mjs            Google Fonts or the exact fonts of a running app
│   ├── palette.mjs          Palette + tokens from a screenshot
│   ├── crop.mjs             Cut UI pieces out of a screenshot
│   ├── preview.mjs          Serve the preview
│   ├── render.mjs           Frames → MP4 + audio, contact sheet, report
│   └── lib/                 ffmpeg, static server, audio synthesizer
└── references/              Brand extraction, storyboard, API, components, audio, troubleshooting, case study
```

## 🔧 Manual use (without Claude)

```bash
node scripts/new.mjs ./my-promo --format 9:16
node scripts/preview.mjs ./my-promo            # open the printed URL
node scripts/render.mjs ./my-promo --draft     # quick check → out/contact.draft.png
node scripts/render.mjs ./my-promo             # final → out/my-promo.mp4
```

## ⚖️ Notes
- Fonts come from Google Fonts (OFL) or your own app. GSAP is installed from npm under its standard (no-charge) license.
- The soundtrack is synthesized in code (no samples). You can use your own licensed track with `--music track.mp3`.
- Only put logos, trademarks and images in the video that you have the right to use.
