#!/usr/bin/env node
// Extracts the color palette of a screenshot/print and suggests brand tokens (paper, ink, brand, accent).
// Usage: node palette.mjs <image> [--k 8] [--rect x,y,w,h]   → table + suggested tokens for the scene's :root
// Tip: sample regions separately (--rect on the logo, a primary button, a card) — a whole UI print is mostly background.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const argv = process.argv.slice(2);
const file = resolve(argv[0] ?? "");
const K = argv.includes("--k") ? Number(argv[argv.indexOf("--k") + 1]) : 8;
const RECT = argv.includes("--rect") ? argv[argv.indexOf("--rect") + 1].split(",").map(Number) : null;
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" }[extname(file).toLowerCase()] ?? "image/png";
const dataUrl = `data:${mime};base64,${(await readFile(file)).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const res = await page.evaluate(async ({ dataUrl, K, RECT }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const [sx, sy, sw, sh] = RECT ?? [0, 0, img.width, img.height];
  const scale = Math.min(1, 360 / Math.max(sw, sh));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
  const g = c.getContext("2d"); g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  // deterministic k-means: seeds spread over luminance order
  function kmeans(points, k) {
    const sorted = [...points].sort((a, b) => lum(a) - lum(b));
    let cent = Array.from({ length: k }, (_, j) => sorted[Math.floor(((j + 0.5) / k) * sorted.length)].slice());
    const assign = new Int32Array(points.length);
    for (let it = 0; it < 12; it++) {
      const sum = cent.map(() => [0, 0, 0, 0]);
      points.forEach((p, i) => { let b = 0, bd = Infinity; cent.forEach((q, j) => { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; b = j; } }); assign[i] = b; const s = sum[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
      cent = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cent[j]));
    }
    const counts = new Array(k).fill(0); assign.forEach((a) => counts[a]++);
    return cent.map((q, j) => ({ rgb: q.map(Math.round), share: counts[j] / points.length }));
  }
  // pass 1: background = most common color bucket
  const buckets = new Map();
  for (const p of px) { const key = p.map((v) => v >> 4).join(","); buckets.set(key, (buckets.get(key) ?? 0) + 1); }
  const [bgKey, bgCount] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  const bgPts = px.filter((p) => p.map((v) => v >> 4).join(",") === bgKey);
  const bg = [0, 1, 2].map((c) => Math.round(bgPts.reduce((s, p) => s + p[c], 0) / bgPts.length));
  // pass 2: only pixels clearly different from the background (text, buttons, icons, illustrations)
  const fg = px.filter((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 38);
  const colors = fg.length > 50 ? kmeans(fg, K) : [];
  return { w: img.width, h: img.height, bg: { rgb: bg, share: bgCount / px.length }, fgShare: fg.length / px.length, colors: colors.filter((x) => x.share > 0.004) };
}, { dataUrl, K, RECT });
await browser.close();

const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const L = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const contrast = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const colors = res.colors.sort((a, b) => b.share - a.share).map((c) => ({ ...c, hex: hex(c.rgb), sat: sat(c.rgb), lum: L(c.rgb) }));
const paper = { ...res.bg, hex: hex(res.bg.rgb), lum: L(res.bg.rgb) };
const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
// ink: the most common low-saturation color with strong contrast against the paper
const ink = colors.filter((c) => c.sat < 0.35 && contrast(c.rgb, paper.rgb) >= 4.5).sort((a, b) => b.share - a.share)[0]
  ?? [...colors].sort((a, b) => contrast(b.rgb, paper.rgb) - contrast(a.rgb, paper.rgb))[0] ?? { hex: paper.lum > 0.5 ? "#111111" : "#f5f5f5" };
const vivid = colors.filter((c) => c.sat > 0.3 && c.lum > 0.02 && c.lum < 0.92).sort((a, b) => b.share * b.sat - a.share * a.sat);
const brand = vivid.find((c) => c.hex !== ink.hex) ?? null; // never the same as ink
const accent = vivid.find((c) => brand?.rgb && c !== brand && Math.min(Math.abs(hue(c.rgb) - hue(brand.rgb)), 360 - Math.abs(hue(c.rgb) - hue(brand.rgb))) > 40);
console.log(`${file}  (${res.w}x${res.h}${RECT ? `, region ${RECT.join(",")}` : ""})\n`);
for (const c of colors) console.log(`  ${c.hex}  ${(c.share * 100).toFixed(1).padStart(5)}%  sat ${c.sat.toFixed(2)}  lum ${c.lum.toFixed(2)}`);
const tokens = { paper: paper.hex, ink: ink.hex, brand: brand?.hex ?? "(no saturated color — sample the logo or a primary button with --rect)", accent: accent?.hex ?? "(none in the print — pick a highlighter that contrasts with brand, e.g. #c4f23a or #fbbf24)", theme: paper.lum > 0.5 ? "light" : "dark" };
console.log(`\nsuggested tokens (verify by eye — the screenshot's dominant color is the app background, the video can still use white):`);
console.log(JSON.stringify(tokens, null, 2));
