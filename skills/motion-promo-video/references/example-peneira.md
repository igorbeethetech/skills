# Case study — "Peneira" (football career game), the video this skill was distilled from

**Input:** a Next.js repo (mobile-first web game, pt-BR). **Output:** 17.2 s, 1080x1920, 60 fps,
synthesized soundtrack with 85 synced cues. Approved by the product owner after one round of feedback.

## What we learned on the way (keep these in mind)
1. **Real screen recording lost.** Playwright `recordVideo` of the real game: blurry (CSS-px capture of a
   540 px layout scaled 2×), 25 fps, and the random game engine had to be seed-searched to even show a goal.
2. **Recreating full screens (v1) felt "frozen"** — owner feedback: *"a tela ainda fica bem travada"*.
   It looked like a screen recording with captions on top.
3. **v2 (approved):** white background, huge masked headlines with a highlighter, the game's pieces as
   floating 3D objects, constant idle motion, match cuts. Owner: *"Agora sim ficou perfeito!"*
4. Then sound: synthesized music with the drop on the goal + an effect for every action.

## Final storyboard
| Time | Scene | What happens | Text |
|---|---|---|---|
| 0.0–2.4 | Hook | Masked headline rises; ball drops and bounces with a shadow; ball kicked out of frame | TODA LENDA / COMEÇOU NUMA / **PENEIRA.** |
| 2.4–4.8 | Create | Yellow training bib turns in 3D, "TAVARES" types on it; 6 position pills pop around it; cursor clicks "CA" (turns lime), OVR 48 bronze pops; the CA pill grows into a lime circle covering the frame | CRIE SEU / **CRAQUE** |
| 4.8–6.8 | Approved | Circular reveal; scout report card tilts in on X, rows stagger, red stamp slams with a shake; card spins out on Y | PASSE NA / **PENEIRA** |
| 6.8–10.4 | The play | Scoreboard pill (derby, 89'); 3 dark game cards fan in with chance rings filling; cursor picks the 81% card, chips show chance/attribute; dashed slot appears; card is dragged (lift, tilt, shadow) and snaps in; **card flips and grows into the goal image** | VOCÊ DECIDE / **O LANCE** |
| 10.4–12.3 | GOAL | Flash on the image, shake, giant "GOL!" (lime with thick ink stroke + hard shadow) slams in, confetti burst, narration chip; **music drop + crowd** | GOL! |
| 12.3–14.7 | Glory | Trophy rises in a gold halo; 4 career pills orbit (champion, national team, youth coach, TV pundit); OVR counter 48→88 changes tier bronze→silver→gold→legend | DA PENEIRA / À ^GLÓRIA^ |
| 14.7–17.2 | Logo + CTA | Everything converges into the center where the logo spins in (brand hit); wordmark rises from a mask; CTA pops; 1.6 s hold with idle | PENEIRA · Jogue grátis no navegador · FAZER MINHA PENEIRA → |

## Tokens used
Light "scout notebook" theme of the game for objects (`--paper #fbf8f1`, `--ink #13241b`, `--brand #0e6a3b`,
`--danger #c3342a`) on a pure white video background; the dark theme's lime `#c4f23a` became the
highlighter/CTA and gold `#f4c542` the second highlighter. Fonts pulled from the running app with
`fonts.mjs --from-url` (Big Shoulders 600–900 + Barlow 400–700).

## Timeline excerpt (motion.js)
```js
Motion.build((M) => {
  const P = M.measure({ ca: "#pill-CA", card: "#card-2", slot: "#slot", gol: "#golcard" });
  // Create
  M.show("#s2", 2.35); M.breathe(2.35, 2.5, { to: 1.08 });
  M.head("#h2", 2.4);
  M.tilt("#bib", 2.5, { axis: "y", deg: -70, y: 200 });
  M.type("#bibname", 2.95);
  M.pop(".pill", 2.7, { rotation: (i, el) => Number(el.dataset.r) });
  M.idle(".pfl", 3.2, 1.6, { amp: 16, rot: 2, period: 0.8 });
  M.cursor.in(3.0); M.cursor.move({ x: P.ca.cx + 20, y: P.ca.cy + 26 }, 3.0);
  M.cursor.click(3.85, { target: "#pill-CA" });
  M.tl.to("#pill-CA .on", { opacity: 1, duration: 0.12 }, 3.9);
  M.pop("#ovr1", 4.05, { pitch: 0.8 });
  const fill = M.circleFill("#fill1", { x: P.ca.cx, y: P.ca.cy }, 4.4);
  M.hide("#s2", 4.82);
  M.reveal("#s3", { x: 540, y: 1000 }, 4.72); fill.hideAt(5.4);
  // The play → goal (match cut)
  const drop = M.cursor.drag("#card-2", P.card, { x: P.slot.cx, y: P.slot.cy }, 8.9, { shadow: "#card-2 .cshadow" });
  M.flipTo("#card-2", P.card, P.gol, drop + 0.15);
  M.hide("#s4", 10.4); M.show("#s5", 10.4);
  M.impact(10.4, { crowd: true }); M.flash(10.4);
  M.shake("#golcard", 10.45);
  M.pop("#golword", 10.5);
  M.confetti({ x: P.gol.cx, y: P.gol.cy - 200 }, 10.45);
  // …glory, logo
  M.brandHit(14.72);
  M.end(15.6, 1.6);
});
```

## Details that made it feel premium
- Pills slightly rotated (±4–7°) and floating with different phases (stagger in `M.idle`).
- Unchosen cards dim to 35% and shrink to 94% when one is picked — one focal point.
- The "GOL!" word overlaps the bottom edge of the image card (depth through overlap).
- Background: very light dot grid drifting slowly + a large soft lime glow moving across the whole video.
- Exits always overlap entrances by 0.1–0.3 s; no empty frame anywhere (verified by the frozen-frame check).
