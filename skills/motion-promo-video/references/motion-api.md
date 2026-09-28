# motion.js API

`motion.js` wraps one paused GSAP timeline (`M.tl`) with helpers that encode the motion language
(easing, overshoot, stagger, cursor physics) **and schedule the matching sound effect**. You can always
drop down to raw GSAP with `M.tl.to/fromTo/set(target, vars, time)`.

## Contents
- Setup (before build) · Scenes & text · Objects · Camera · Cursor · Transitions · Sound & timing
- Recipes: drag & drop · match cut · circle transition · converge into logo · counter with tier change
- Motion language rules

## Setup (top-level, before `Motion.build`)
```js
Motion.init({
  size: [1080, 1920],                          // must match --W/--H in CSS
  fonts: ["800 150px 'Display'", "600 36px Body"], // every face used; loaded before layout
  seed: 7,                                     // PRNG seed (confetti, audio variations)
  music: { bpm: 118, key: "C", mode: "major", intro: 2.3 },   // see audio.md
});
const T = Motion.copy(COPY);      // picks ?lang= (or first), fills [data-t] (dot paths ok: data-t="cards.0")
Motion.lines("#h1", T.h1);        // masked headline lines; *hl* / ^hl2^ highlighters
Motion.letters("#name");          // split text into letters (M.type does it automatically)
Motion.build((M) => { … });       // everything time-based goes in here
```

## Inside `Motion.build((M) => …)` — `t` is always absolute seconds

**Measure first**
- `M.measure({ key: "#sel", … })` → `{ key: { x, y, w, h, cx, cy } }` (untransformed layout rects).
- `M.rect(sel)`, `M.center(sel, dx, dy)` — same, single element.
- These read a **snapshot taken before `build()` runs**, so they're safe anywhere in `build` for elements
  that exist in the HTML. Elements created inside `build` (e.g., by your own loops) are measured live.

**Scenes & text**
- `M.show(sel, t)` / `M.hide(sel, t)` — toggle a `.scene`.
- Review frames for the contact sheet are registered automatically by `show` (+0.9 s), `head` (+1.0 s),
  `reveal`, `impact` and `brandHit`; frames closer than 0.6 s are merged. Add `M.review(name, t)` for
  any storyboard beat that isn't covered.
- `M.head(sel, t, { stagger })` — lines rise from their masks, highlighter swipes (+ whoosh, swoosh).
- `M.headOut(sel, t)` — lines exit upward (+ whoosh down).
- `M.type(sel, t, { every: 0.07 })` — letter-by-letter reveal (+ typing clicks). Works on HTML and SVG `<text>` (creates SVG `<tspan>`s in the SVG namespace).
- `M.count(sel, from, to, t, dur, { fmt: v => \`${Math.round(v)}%\`, onValue })` — number counter (+ ticks).

**Objects**
- `M.pop(sel, t, { stagger, rotation: (i, el) => deg, from: "start"|"end"|"center", pitch })` — scale 0→1 with back.out overshoot (+ pops with rising pitch). Target the *inner* element; float the `.fl` wrapper.
- `M.rise(sel, t, { y: 60, stagger })` — soft rise + fade (secondary text).
- `M.tilt(sel, t, { axis: "x"|"y", deg: 55, y: 240 })` — 3D entrance (card lying down / page turning) (+ whoosh/flip).
- `M.draw(sel, t, { dur: 0.6, stagger: 0.12 })` — SVG strokes draw themselves (paths, lines, rects, circles; uses `getTotalLength`) (+ pencil scribble). Great for diagrams, underlines, arrows, doodles, checkmarks.
- `M.idle(sel, t, dur, { amp: 14, rot: 1.2, period: 1.3 })` — sine float; use on every visible object after it lands.
- `M.stamp(sel, t, { rot: -6, shakeTarget })` — rubber-stamp slam (+ stamp thud), optional shake of the parent.
- `M.shake(sel, t, { px: 14, dur: 0.34 })` — impact shake.
- `M.flash(t)` — white flash over the frame.
- `M.confetti({ x, y }, t, { n: 64, colors, spread })` — seeded burst that falls and fades (+ sparkle).

**Camera** (`#camera` has origin 0 0; helpers handle the math)
- `M.breathe(t, dur, { from: 1, to: 1.05, rot })` — slow push around the center; put one on every scene.
- `M.camFocus(x, y, scale, t, dur)` — zoom to a point without showing the stage edge.
- `M.camReset(t)` — snap back (do it at a cut).

**Cursor** (lives inside the camera, so it zooms with the scene)
- `M.cursor.in(t, from?)`, `M.cursor.out(t)`.
- `M.cursor.move({ x, y }, t, dur = 0.8, bend = 0.25)` — curved Bézier path, power3.inOut (never linear).
- `M.cursor.click(t, { target, at })` — cursor squash, target squash 0.94 + overshoot, ripple (+ click).
- `M.cursor.drag(sel, rect, to, t, { dur: 0.6, shadow })` → returns drop time. Lift (scale, tilt, shadow grows) → travel → drop with overshoot (+ lift, swoosh, snap).

**Transitions**
- `M.circleFill(fillSel, { x, y }, t, { color, dur })` → `{ hideAt(t) }` — a `.m-fill` div placed **between** the leaving and entering scenes grows from a point (e.g., from the clicked button).
- `M.reveal(sceneSel, { x, y }, t, { dur: 0.66 })` — circular reveal of the next scene. The scene needs an opaque background (`class="scene opaque"`), which covers the drifting background for that scene — keep `M.breathe` + `M.idle` on it so it still feels alive.
- `M.flipTo(sel, rect, toRect, t)` — match cut: a `.flip` card turns 180° and grows into the next scene's hero.
- `M.converge([{ el, r }], { x, y }, t)` — everything collapses into one point (right before the logo).

**Sound & timing**
- `M.impact(t, { crowd, flashIt })` — payoff: riser before, impact on t, optional crowd; sets the music **drop**.
- `M.brandHit(t)` — logo sound + the soundtrack's final chord starts here.
- `M.end(t, dur = 1.6)` — final hold; the renderer ignores frozen frames after `t`.
- `M.sfx(type, t, { gain, pitch, dur, pan, dir })` — any extra effect (see audio.md). Every helper accepts `{ sfx: false }`.
- `M.music({ bpm, key, … })`, `M.review(name, t)` — extra review frame for the contact sheet.
- `M.prng(seed)` — deterministic random for your own loops.

## Recipes

**Drag & drop onto a target**
```js
const P = M.measure({ card: "#card-2", slot: "#slot" });
M.cursor.move({ x: P.card.cx, y: P.card.cy + 30 }, 7.5);
M.cursor.click(8.2, { target: "#card-2" });
M.pop("#slot", 8.6);
const dropAt = M.cursor.drag("#card-2", P.card, { x: P.slot.cx, y: P.slot.cy }, 8.9, { shadow: "#card-2 .cshadow" });
M.tl.to("#slot", { autoAlpha: 0, duration: 0.3 }, dropAt);
```

**Match cut (card flips into the next scene's image)**
```html
<div class="flip" id="card-2" style="width:296px;height:356px">
  <div class="face front">…card…</div>
  <div class="face back"><img src="assets/result.webp" style="width:100%;height:100%;object-fit:cover"></div>
</div>
<!-- next scene -->
<div id="hero" style="width:719px;height:865px">…same image…</div>
```
```js
const P = M.measure({ card: "#card-2", hero: "#hero" });   // same aspect ratio → seamless
M.flipTo("#card-2", P.card, P.hero, 9.85);                 // lands exactly where #hero is
M.hide("#s4", 10.4); M.show("#s5", 10.4);                   // swap on the frame it lands
```

**Circle transition from a clicked element**
```html
<section class="scene" id="s2">…</section>
<div class="m-fill" id="fill1"></div>                 <!-- between the two scenes -->
<section class="scene" id="s3" style="background:var(--paper)">…</section>
```
```js
const f = M.circleFill("#fill1", { x: P.pill.cx, y: P.pill.cy }, 4.4, { color: "var(--accent)" });
M.hide("#s2", 4.82);
M.reveal("#s3", { x: 540, y: 1000 }, 4.72);   // starts while the fill is still growing → no dead frame
f.hideAt(5.4);
```

**Converge into the logo**
```js
const items = [...document.querySelectorAll("#s6 .fl")].map((el) => ({ el, r: M.rect(el) })); // snapshot geometry — safe anywhere in build
M.converge(items, { x: 540, y: 880 }, 14.35);
M.show("#s7", 14.7); M.tl.fromTo("#logo", { scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2)" }, 14.72);
M.brandHit(14.72);
```

**Counter with tier change**
```js
M.count("#ovr b", 48, 88, 13.0, 1.1, { onValue: (v) => { const k = v >= 85 ? "legend" : v >= 75 ? "gold" : "silver"; badge.dataset.tier = k; } });
```

## Motion language rules
- Easing: entrances `back.out(1.4–2.6)` (overshoot) or `power4.out`; exits `power3.in`; moves `power3.inOut`. Never linear, except background drift.
- Stagger lists 0.05–0.1 s. Clicks squash to 0.94. Drag lifts: shadow grows, ±5° tilt, scale 1.1, then overshoot on drop.
- Depth: `perspective` on scenes; `rotationX/Y` entrances; layered soft shadows; objects slightly overlapping the headline area read as "in front".
- Keep every scene alive: `M.breathe` + `M.idle` on landed objects. The CTA hold keeps only subtle idle.
- One focal point at a time; dim or shrink secondary elements when the hero acts (e.g., unchosen cards to 35% opacity).
