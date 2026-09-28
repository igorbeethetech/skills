# Component kit — turning a product into animatable objects

The template ships these classes (section 3 of `scene.html`). Restyle them with the brand tokens; add
product-specific ones next to them.

| Class | What it is | Typical motion |
|---|---|---|
| `.head` + `Motion.lines` | display headline, masked lines, highlighter | `M.head` / `M.headOut` |
| `.kicker` | small uppercase label above the headline | `M.pop` |
| `.card` | white card with big radius and layered shadow | `M.tilt` (x), `M.idle`, `M.flipTo` |
| `.pill` | dark rounded label (options, positions, tags) | `M.pop` with rotation, selection via a lime `.on` layer |
| `.chip` / `.chip.good` | small benefit/status pill with icon | `M.pop`, orbit around a hero with `M.idle` |
| `.btn` / `.btn.cta` | primary button / final CTA | `M.cursor.click({ target })`, `M.pop` |
| `.badge` | square stat/score tile | `M.pop`, `M.count`, tier gradients |
| `.avatar` | overlapping people circles | `M.pop` stagger |
| `.progress > i` | progress bar (animate `scaleX` of `i`) | `M.tl.fromTo(i, {scaleX:0}, {scaleX:.7})` |
| `.toast` | success notification | `M.pop` with high pitch |
| `.shot` | `<img>` of a cropped screenshot piece | `M.tilt`, `M.idle` |
| `.phone` | device frame around a screenshot/video | `M.tilt` (y), slow `M.breathe` |
| `.logo`, `.word`, `.tag` | end card | pop + mask reveal + rise |
| `.flip > .face.front/.back` | 3D card with two sides | `M.flipTo` match cut |
| `.fl` | float wrapper (idle goes here, entrances go on the child) | `M.idle` |

## Rebuilding a product element (preferred for hero objects)
1. Find it in the code (or the print) and copy its *essence*: shape, radius, colors, the 2–3 pieces
   of text/data, the icon. Drop secondary details — objects are read in 2 seconds.
2. Scale for video: mobile CSS px × 2.5 on a 1080-wide canvas; minimum text 26 px, body 34–46 px,
   titles 56–130 px.
3. Use real vocabulary from the product (status names, button labels, units).
4. Make interactive parts separate elements (`#btn`, `.ring`, `.progress i`) so they can animate.
5. Give it a soft layered shadow (`--sh-1`/`--sh-2`) — on white, shadows are what create depth.

Examples from real projects:
- **Game card** (dark gradient, gold hairline, chance ring SVG, title, attribute) → fanned hand of 3
  cards, rings fill, one gets picked, dragged to a dashed slot, flips into the result image.
- **Scout report** (lined paper, name + number, 2-column facts, red stamp) → tilts in on X, rows
  stagger, stamp slams with a shake.
- **Score/OVR badge with tiers** (bronze → silver → gold → legend gradients stacked, only the current one
  visible) → counter drives which tier layer is visible.

## Screenshot pieces (`.shot`)
```bash
node <skill>/scripts/crop.mjs print.png --grid grid.png          # read coordinates on the grid image
node <skill>/scripts/crop.mjs print.png 40,610,1000,420 assets/chart.png --scale 2
```
```html
<div class="fl"><img class="shot" id="chart" src="assets/chart.png" style="width:900px"></div>
```
Keep `border-radius` and shadow on the crop so it reads as an object, not a pasted screenshot.

## Layout
- Scenes are flex columns centered in the safe area (`.scene`); in 16:9 add `class="scene split"` to
  put text and objects side by side.
- **Free canvas** (diagrams, collages, whiteboards): `class="scene free"` and position children with `left/top`.
- **Orbiting objects** (chips/pills around a hero): only the float wrapper is absolute, the chip stays inline:
  ```html
  <div class="fl orbit" style="left:60px;top:720px"><span class="chip">Real time</span></div>
  ```
  (Making both wrapper and chip absolute collapses the wrapper to 0 px and chips drift off-frame.)
  Check the positions on the draft contact sheet; the renderer warns when text leaves the safe area.
- **Scenes revealed with `M.reveal`** need `class="scene opaque"` (paper + static dot grid).
- Don't let objects cover the headline: headline zone first (top ~35% in 9:16), objects below.

## Brand typography
- Condensed/grotesque display fonts: uppercase `.head` works well.
- Script/handwritten fonts (Kalam, Caveat…): `class="head script"` (sentence case, ~15% smaller);
  check line widths — `.ln` never wraps, so a long line gets clipped (the renderer warns).
- Only use weights the font has (`fonts.mjs` prints them); a missing weight fails the render instead of
  silently showing a synthetic bold.

## Logos and icons cropped from a white screenshot
`mix-blend-mode: multiply` does NOT work inside the scene (GSAP transforms isolate each element). Knock
the white out instead: `crop.mjs print.png x,y,w,h assets/logo.png --knockout-white` → transparent PNG with
soft edges. Prefer an official SVG/PNG logo from the repo or the user when one exists.
