# Storyboard — structure, timing, copy, formats

## The shape of a 15–18 s product ad

| # | Beat | Length | Purpose | Typical objects |
|---|---|---|---|---|
| 1 | **Hook** | 2–2.5 s | Stop the scroll: the promise in ≤ 6 words, with motion from frame 1 | headline + one hero object (logo tile, ball, product icon) |
| 2 | **Setup / create** | 2–2.5 s | Show the user starting (pick, create, connect) | pills/options, a form element, cursor click |
| 3 | **Proof / progress** | 2 s | Something gets done or approved | card with status, stamp, progress bar, toast |
| 4 | **Core interaction** | 3–3.5 s | The signature action of the product — the "aha" | cards/buttons + drag & drop or multi-click, chips with benefits |
| 5 | **Payoff** | 2 s | Emotional peak: the result, big | full-bleed image/number/word, flash, confetti, **music drop** |
| 6 | **Depth / breadth** | 2–2.5 s | "There's more": 3–4 benefit pills orbiting a trophy/stat | feature chips, counter, badge tier-up |
| 7 | **Logo + CTA** | ≥ 2.5 s (hold ≥ 1.5 s) | Brand + one action | logo, wordmark, tagline, CTA button |

Shorter (8–12 s): Hook → Core interaction → Payoff → CTA. Longer (25–30 s): repeat beat 4 for 2–3 features.

## Rhythm
- A cut or a clear change of focus every **1.5–3 s**. One idea per scene.
- Headline enters first (0–0.4 s into the scene), objects follow (0.3–0.8 s), interaction after the
  viewer has read the headline (~0.8–1.2 s in).
- Transitions overlap by 0.1–0.3 s (exit of A while B enters) — never a blank frame between scenes.
- Put the **payoff on the music drop** (`M.impact(t)`) and the logo on `M.brandHit(t)`.
- End with the CTA **held** (≥ 1.5 s) with only subtle idle motion.

## Copy rules (on-screen text)
- Silent-first: the video must make sense muted. Headline = the whole story of that scene.
- ≤ 5 words per line, ≤ 2 lines per headline; highlight 1–2 words (`*word*`).
- Use the product's own vocabulary (button labels, statuses) inside objects — it makes it real.
- Verbs and outcomes beat features: "Decide the play", "Ship faster", "Get paid today".
- CTA: imperative + benefit, ≤ 4 words ("Start your trial", "Fazer minha peneira").
- Portuguese: correct accents always (é, ç, ã…). Localize by adding a language to `COPY`, not by
  duplicating scenes.

## Formats & safe areas
| Format | Size | Use | Safe area for text/CTA |
|---|---|---|---|
| 9:16 | 1080x1920 | Reels, TikTok, Shorts, Stories | x 60–1020, y 250–1560 (top bar + bottom caption/UI) |
| 4:5 | 1080x1350 | Instagram/LinkedIn feed | 60 px margins |
| 1:1 | 1080x1080 | feed, ads | 60 px margins |
| 16:9 | 1920x1080 | YouTube, site hero, LinkedIn | 90 px margins; use `.scene.split` rows (text left, objects right) |

`new.mjs --format` sets the size; the template's flex layout adapts, but always review the contact
sheet of a new format — some scenes need a row layout in 16:9.

## Storyboard template (present this to the user)

| Time | Scene | What appears / happens | Camera | On-screen text |
|---|---|---|---|---|
| 0.0–2.4 | Hook | Headline rises line by line, highlighter swipes "peneira"; ball drops and bounces | slow push-out 1.06→1 | TODA LENDA COMEÇOU NUMA **PENEIRA.** |
| 2.4–4.8 | Create | Training bib turns in 3D, name types on it; position pills orbit; cursor clicks "CA", OVR 48 pops | push 1→1.08 | CRIE SEU **CRAQUE** |
| … | … | … | … | … |
| 14.7–17.2 | Logo + CTA | Everything converges into the logo; wordmark, tagline, CTA; hold | still + idle | PENEIRA · Jogue grátis · FAZER MINHA PENEIRA → |

Add one line under the table: format, duration, language(s), sound choice.
