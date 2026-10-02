# Troubleshooting — pitfalls already paid for

| Symptom | Cause | Fix |
|---|---|---|
| Render hangs on the first frame | `page.evaluate(() => window.seek(t))` returned the GSAP timeline; Playwright tries to serialize it | `window.seek` returns nothing (motion.js does this) — keep it that way in custom code |
| A whole scene renders empty | `from({ autoAlpha: 0 })` on something that starts hidden animates 0 → 0 | use `M.show` / `fromTo` for anything that starts invisible |
| Cursor clicks the wrong place, drag lands off target | positions measured after a `from()`/`fromTo()` already moved the element | `M.measure()` at the top of `build`, before any tween |
| Wrong/fallback font in frames | font not declared in `fonts.css`, or not listed in `Motion.init({ fonts })`, or loaded over `file://` | run `fonts.mjs`; list every face in `fonts`; always go through `render.mjs`/`preview.mjs` (http) |
| Accents clipped at the top of headlines (É, Ç, Ã) | mask line-height too tight | `.ln` has top padding; if you change `line-height`, keep ~0.1em padding-top |
| Headline wraps into more lines than planned | line too long for the font size | `.ln` is `nowrap`: shorten the copy or lower `--head` (≤ 5 words/line) |
| Transition shows a solid color frame / "frozen" warning at a cut | the covering layer (circle fill) sits above the next scene, or the reveal starts after the cover completes | put `.m-fill` between the scenes in the DOM (no z-index), start `M.reveal` ~0.1 s before the fill completes |
| Circle transition grows from the wrong point | `.m-fill` has `inset:-160px`; custom fills need the same offset | use `M.circleFill` (it compensates) |
| Reveal looks like a hard cut | `power3.out` reaches 90% of the radius in ~60 ms | `power2.inOut`, ~0.65 s (the `M.reveal` default) |
| Confetti or objects from a previous scene linger | particles live in `#m-fx`, not in the scene | motion.js fades confetti; hide/fade your own leftovers before the next scene |
| Zoom goes toward the top-left corner | camera origin is `0 0` | use `M.breathe` / `M.camFocus` (they compensate), not raw `scale` on `#camera` |
| Video looks soft | captured below 1080 px or scaled up | the renderer captures at the scene size with DPR 1 — keep `size` = output size; for crops, ≤ 2× upscale |
| Real-time screen recording of the app is blurry | Chromium screencast/`recordVideo` capture CSS pixels and ignore `deviceScaleFactor` | don't record the app; rebuild objects or use Playwright *screenshots* (which honor DPR) as crops |
| 25 fps recording converted to 30 fps judders | 1 duplicated frame every 5 | not applicable here (60 fps exact) — if you ever mux real recordings, keep the native rate |
| Loudness too low/high, clipping | — | mastering is automatic (−14 LUFS, TP < −1); check `report.json` |
| `render.mjs` refuses the scene | `Math.random`/`Date.now`/timers/CSS `animation`/`transition` found | move it to the timeline; use `Motion.prng(seed)` |
| Frozen-frame warning inside a scene | nothing moves for ≥ 50 ms | add `M.idle` to landed objects and `M.breathe` to the scene |
| `ffmpeg` not found right after installing | PATH not refreshed in the current shell | `doctor.mjs` also searches winget/Homebrew/choco folders; or set `FFMPEG=/path/to/ffmpeg` |
| Chromium missing / wrong revision | npm installed a newer Playwright | `npx playwright install chromium` inside the skill folder |
| SVG `<text>` disappears after `M.type` | `<tspan>` created in the HTML namespace (old motion.js) | current motion.js uses `createElementNS`; re-copy `runtime/motion.js` into the project's assets |
| Logo crop shows a white box on colored backgrounds | `mix-blend-mode` doesn't work under GSAP transforms | `crop.mjs … --knockout-white`, or use the official logo file |
| Revealed scene loses the dot grid/glow | `M.reveal` needs an opaque scene | `class="scene opaque"` (static grid); keep idle motion on its objects |
| Render fails with "font faces not available" | a weight listed in `Motion.init({ fonts })`/CSS isn't in `fonts.css` | fetch it (`fonts.mjs … "Family:400,700"`) or use a weight the family has |
| Contact sheet misses a storyboard beat | no helper registered a review frame there | `M.review("beat", t)` |
| Need to inspect an exact moment | draft frames snap to 1/6 s | `render.mjs <project> --still 4.25,9.1` |
| "outside safe area" / "clipped line" warnings | text off-frame, under platform UI, or a headline wider than the frame | fix the layout; ignore only for objects mid-entrance you've looked at |
| SVG shapes fly in from a corner when popped/scaled | SVG transform origin defaults to the top-left of the viewBox | `M.pop` sets 50% 50% on SVG elements; for raw tweens use `gsap.set(el, { transformOrigin: "50% 50%" })` |
| Highlighted word invisible on a dark background before the swipe | `.hl` text is set dark (to sit on the lime mark) | keep `.hl` light and tween it dark when the mark passes: `M.tl.fromTo(sel + " .hl", { color: light }, { color: dark, duration: .25 }, t + .55)` |

