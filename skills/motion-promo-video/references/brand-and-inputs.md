# Brand & inputs — getting tokens, fonts and objects from whatever the user gives you

The goal of this step is always the same, whatever the input:

1. **Tokens**: `--paper`, `--ink`, `--ink-2`, `--muted`, `--line`, `--brand`, `--brand-2`, `--on-brand`,
   `--accent` (highlighter + CTA), `--accent-2`, `--radius`, display font, body font.
2. **Objects**: 5–10 things worth animating — the product's *signature* UI pieces, not whole screens.
3. **Facts**: what the product does, for whom, and the one message. Only real facts.

## A. Repository

Read, in this order (stop when you have enough):

| Look for | Where it usually is |
|---|---|
| What the product is, tagline, tone | README, landing/home page component, `messages/*.json` / i18n files, `<title>`/meta description |
| Colors | `globals.css` / `:root` CSS variables, `tailwind.config.*` `theme.extend.colors`, `@theme` in Tailwind v4, theme files (`theme.ts`, MUI/Chakra themes), design-token JSON |
| Fonts | `next/font` imports in the root layout, `@font-face`, `<link href="fonts.googleapis.com…">`, `font-family` in CSS |
| Radius/shadows | CSS variables, Tailwind `borderRadius`/`boxShadow`, component classes (`rounded-2xl` = 16px CSS → ×2.5 on a 1080-wide canvas) |
| Logo | `public/`, `assets/`, `favicon.svg`, a `Logo` component (often inline SVG — copy it) |
| Signature objects | the components users see most: cards, primary buttons, badges/status pills, stat tiles, charts, list items, player/profile cards, empty states |
| Real assets | illustrations, product images, icons (lucide/heroicons → inline SVG paths) |

Tips:
- If the app has light and dark themes, pick the one that fits the video style (white video → light
  tokens), but you may borrow the dark theme's vivid accent for the highlighter/CTA.
- Mobile-first UI scaled to a 1080-wide canvas: multiply CSS px by ~2.5 (a 432px phone layout).
- To use the app's **exact** fonts: run the dev server and `fonts.mjs <project> --from-url http://localhost:PORT`.
  Otherwise `fonts.mjs <project> "Family:weights"` from Google Fonts.
- Copy images into `<project>/assets/`; never hotlink. Check licensing of third-party logos/crests
  before publishing (fair-use images inside a product can be a problem in ads).
- Screenshots of the running app are great **references** and **crops** — use Playwright at the
  mobile viewport (e.g., 390x844 @3x) for crisp crops.

## B. Screenshots / prints (no code)

This is a first-class input — often all the user has.

1. **Look** at every image first. Note: product type, brand colors, typography style (geometric sans,
   condensed, serif, rounded…), corner radius, shadows, iconography, the 3–6 elements that make the
   product recognizable, and any readable text (product name, labels, numbers).
2. **Palette**: `node <skill>/scripts/palette.mjs shot.png` → background + content colors + suggested tokens.
   A UI print is mostly background, so also sample **regions**: `--rect x,y,w,h` on the logo, a primary
   button, a selected tab, a chart — that's where brand colors live. Verify by eye; the video can stay white.
   Coordinates are **native pixels** of the image — the Read tool may show it downscaled (e.g., 2880→2000);
   get real coordinates with `crop.mjs shot.png --info` / `--grid grid.png`.
3. **Fonts**: identify the closest Google Font by look (e.g., "Inter-like grotesk" → Figtree/Manrope,
   "condensed stadium type" → Big Shoulders/Oswald, "rounded" → Nunito/Quicksand). If the user knows
   the brand font, use it (local files → `assets/fonts` + `@font-face`).
4. **Objects** — two ways, mix freely:
   - **Rebuild** the element in HTML/CSS with the component kit (best quality, fully animatable: the
     button can be clicked, the counter can count, the card can flip). Prefer this for the 2–4 hero objects.
   - **Crop** it from the print: `crop.mjs shot.png --grid grid.png` (look at the grid to read
     coordinates) → `crop.mjs shot.png x,y,w,h assets/card.png --scale 2` → `<img class="shot">`.
     Good for complex visuals (maps, charts, illustrations) that would be slow to rebuild. Low-res
     prints get soft when scaled; keep crops ≤ ~2× their original size.
   - A whole screenshot can appear once inside `.phone` as a "this is the real app" moment — but
     never as the backbone of the video.
5. **Photos of a physical object** (packaging, device, merch): cut the object out if the background is
   clean (or ask the user for a PNG with transparency), and treat it as the hero object with a soft
   shadow; the rest of the video is typography + UI-like chips describing benefits.

## C. Only a description

Ask (in the single intake batch) whether they have a logo, brand colors or a site. If not, propose a
small brand in one line ("indigo + lime highlighter, Bricolage Grotesque + Figtree — ok?") and build
objects that represent the product's core action (e.g., for an invoicing app: an invoice card, a "Paid"
status pill, a revenue counter, a "Send" button).

## D. Running URL / production site
Same as the repository route, but through the browser: screenshots with Playwright, `fonts.mjs
--from-url`, palette from a screenshot. Don't log in or submit forms on the user's behalf.

## Token sanity check
- Text on `--accent` must be readable (`--on-accent`), same for `--brand`/`--on-brand` (≥ 4.5:1).
- Highlighter color must contrast with `--ink` text on top of it (lime/yellow work on dark ink).
- If the brand color is very dark, use it for objects and pick a brighter accent for highlights.
