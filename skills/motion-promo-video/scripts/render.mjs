#!/usr/bin/env node
// Deterministic frame-by-frame render of a motion.js scene → H.264 MP4 with synthesized (or supplied) audio.
//
// Usage: node render.mjs <project-dir> [options]
//   --draft            quick review pass: 6 fps → out/<name>.draft.mp4, out/contact.draft.png, out/review/ (frames snap to 1/6 s)
//   --still 5.1,7.5    exact screenshots at those times → out/stills/ (seconds; no video) — for inspecting details
//   --fps 60           final frame rate (default 60)
//   --jobs 4           parallel browser pages
//   --lang en          renders ?lang=en (file gets a .en suffix)
//   --scene file.html  scene file inside the project (default scene.html)
//   --music track.mp3  use this track instead of the synthesized music (SFX stay; music is ducked under them)
//   --no-audio         silent video
//   --out name         output file name (default: the project folder name)
//   --from 3 --to 6    render only a time window (debugging)
//
// Output: <project>/out/<name>.mp4, out/contact.png, out/review/*.png, out/report.json
// Checks: non-deterministic code (fails), fonts/weights not loaded (fails), frozen frames, clipped text and
// text outside the safe area at every review frame (warnings in the console and report.json).
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ffmpeg, loudness, probe } from "./lib/ffmpeg.mjs";
import { serve } from "./lib/server.mjs";
import { renderAudio } from "./lib/audio.mjs";

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const VALUE_FLAGS = new Set(["--fps", "--jobs", "--lang", "--scene", "--music", "--from", "--to", "--out", "--still"]);
const PROJECT = resolve(argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1])) ?? ".");
const DRAFT = flag("draft");
const FPS = Number(arg("fps", DRAFT ? 6 : 60));
const JOBS = Number(arg("jobs", 4));
const LANG = arg("lang", null);
const SCENE = arg("scene", "scene.html");
const OUT = join(PROJECT, "out");
const FRAMES = join(PROJECT, ".frames");
const NAME = `${arg("out", basename(PROJECT))}${SCENE === "scene.html" ? "" : "." + SCENE.replace(/\.html$/, "")}${LANG ? "." + LANG : ""}${DRAFT ? ".draft" : ""}`;
const t0 = Date.now();

// 1) determinism guard: the scene must be a pure function of t
const src = (await readFile(join(PROJECT, SCENE), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const FORBIDDEN = { "Math.random(": /Math\.random\s*\(/, "Date.now(": /Date\.now\s*\(/, "performance.now(": /performance\.now\s*\(/, "setTimeout(": /setTimeout\s*\(/, "setInterval(": /setInterval\s*\(/, "@keyframes": /@keyframes/, "CSS animation:": /[{;\s]animation\s*:/, "CSS transition:": /[{;\s]transition\s*:/ };
const bad = Object.entries(FORBIDDEN).filter(([, re]) => re.test(src)).map(([k]) => k);
if (bad.length) { console.error(`✗ ${SCENE} uses non-deterministic features: ${bad.join(", ")} — drive everything from the GSAP timeline (use Motion.prng for randomness).`); process.exit(1); }

// 2) serve + open pages
const server = await serve(PROJECT);
const url = `${server.url}/${SCENE}${LANG ? `?lang=${LANG}` : ""}`;
const browser = await chromium.launch();
const problems = [];
async function openPage(size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: "load" });
  const duration = await page.evaluate(() => window.READY);
  const meta = await page.evaluate(() => {
    const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ""), weight: f.weight, status: f.status }));
    // every face listed in Motion.init({ fonts }) must have a loaded FontFace of that family AND weight (else: synthetic bold / fallback)
    const missing = (window.MOTION_FONTS ?? []).filter((spec) => {
      const m = /^\s*(?:(italic|normal)\s+)?(\d{3})?\s*[\d.]+px\s+["']?([^"',]+)["']?/.exec(spec); if (!m) return false;
      const w = Number(m[2] ?? 400), fam = m[3].trim();
      return ![...document.fonts].some((f) => f.family.replace(/["']/g, "") === fam && f.status === "loaded" && (() => { const [a, b = a] = String(f.weight).split(" ").map(Number); return w >= a && w <= b; })());
    });
    return { size: window.SIZE, hold: window.HOLD_FROM, review: window.REVIEW ?? {}, audio: window.AUDIO ?? null, faces, missing };
  });
  return { page, duration, meta };
}
let first = await openPage({ width: 1080, height: 1920 });
const SIZE = { width: first.meta.size?.w ?? 1080, height: first.meta.size?.h ?? 1920 };
if (SIZE.width !== 1080 || SIZE.height !== 1920) { await first.page.close(); first = await openPage(SIZE); }
const workers = [first, ...(await Promise.all(Array.from({ length: JOBS - 1 }, () => openPage(SIZE))))];
const { duration: DURATION, meta: META } = first;

// fonts: any face in error, or a declared family with nothing loaded, means a fallback font is on screen
const fam = {};
for (const f of META.faces) (fam[f.family] ??= []).push(f.status);
const fontErrors = Object.entries(fam).filter(([, s]) => s.includes("error")).map(([f]) => f);
const fontUnused = Object.entries(fam).filter(([, s]) => !s.includes("loaded")).map(([f]) => f);
if (fontErrors.length) problems.push(`fonts failed to load: ${fontErrors.join(", ")}`);
if (META.missing?.length) problems.push(`font faces not available (fallback/synthetic weight on screen): ${META.missing.join(" | ")} — fetch that weight with fonts.mjs or change the weight in the CSS + Motion.init({ fonts })`);
if (problems.length) { console.error(`✗ ${[...new Set(problems)].join("\n  ")}`); await browser.close(); server.close(); process.exit(1); }

// 2b) stills mode: exact frames for inspection, then exit
if (arg("still", null)) {
  const times = arg("still").split(",").map(Number).filter(Number.isFinite);
  const dir = join(OUT, "stills");
  await mkdir(dir, { recursive: true });
  for (const t of times) {
    await first.page.evaluate((x) => new Promise((r) => { window.seek(x); requestAnimationFrame(() => requestAnimationFrame(() => r())); }), t);
    const file = join(dir, `still@${t.toFixed(2)}s.png`);
    await first.page.screenshot({ path: file, type: "png" });
    console.log(`✓ ${file}`);
  }
  await browser.close(); server.close(); process.exit(0);
}

// 2c) layout audit at each review time: clipped headline lines, visible text outside the safe area
const SAFE = SIZE.height > SIZE.width ? { x0: 40, x1: SIZE.width - 40, y0: 200, y1: SIZE.height - 330 } : { x0: 40, x1: SIZE.width - 40, y0: 40, y1: SIZE.height - 40 };
const layout = [];
for (const [name, t] of Object.entries(META.review)) {
  const found = await first.page.evaluate(({ t, SAFE }) => {
    window.seek(t);
    const out = [], label = (el) => (el.id ? "#" + el.id : el.className && typeof el.className === "string" ? el.tagName.toLowerCase() + "." + el.className.split(" ")[0] : el.tagName.toLowerCase()) + ` "${el.textContent.trim().slice(0, 24)}"`;
    const visible = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
    for (const el of document.querySelectorAll("#stage .ln")) if (visible(el) && el.scrollWidth > el.clientWidth + 2) out.push(`clipped line ${label(el)} (${el.scrollWidth}px > ${el.clientWidth}px)`);
    const texts = [...document.querySelectorAll("#stage *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && visible(el) && !el.closest("#m-fx"));
    for (const el of texts) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.left < SAFE.x0 - 1 || r.right > SAFE.x1 + 1 || r.top < SAFE.y0 - 1 || r.bottom > SAFE.y1 + 1) out.push(`outside safe area ${label(el)} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    return out;
  }, { t, SAFE });
  for (const f of found) layout.push(`${t.toFixed(2)}s ${f}`);
}

// 3) capture
const from = Math.round(Number(arg("from", 0)) * FPS);
const to = Math.min(Math.round(Number(arg("to", DURATION)) * FPS), Math.round(DURATION * FPS));
const total = to - from + 1;
await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });
console.log(`▶ ${url}\n  ${SIZE.width}x${SIZE.height} · ${DURATION.toFixed(2)} s · ${FPS} fps · ${total} frames · ${JOBS} workers${DRAFT ? " · DRAFT" : ""}`);
let done = 0;
const tCap = Date.now();
await Promise.all(workers.map(async ({ page }, k) => {
  for (let i = from + k; i <= to; i += JOBS) {
    // seek + double rAF in one round trip; never return the GSAP timeline (serializing it hangs evaluate)
    await page.evaluate((t) => new Promise((r) => { window.seek(t); requestAnimationFrame(() => requestAnimationFrame(() => r())); }), i / FPS);
    await page.screenshot({ path: join(FRAMES, `${String(i - from).padStart(5, "0")}.png`), type: "png" });
    done++;
    if (done % 8 === 0 || done === total) {
      const el = (Date.now() - tCap) / 1000;
      process.stdout.write(`\r  capturing ${done}/${total} (${((done / total) * 100).toFixed(0)}%) · ${(done / el).toFixed(1)} fps · ~${((total - done) / (done / el)).toFixed(0)} s left   `);
    }
  }
}));
process.stdout.write("\n");
const captureSecs = (Date.now() - tCap) / 1000;
await browser.close();
server.close();

// 4) frozen-frame check (identical consecutive frames before the final hold = the video "freezes")
const files = (await readdir(FRAMES)).filter((f) => f.endsWith(".png")).sort();
const hashes = await Promise.all(files.map(async (f) => createHash("md5").update(await readFile(join(FRAMES, f))).digest("hex")));
const holdFrame = Math.round((META.hold ?? DURATION) * FPS);
const minRun = Math.max(3, Math.round(FPS * 0.05));
const frozen = [];
for (let i = 1, s = 0; i <= hashes.length; i++) {
  if (i < hashes.length && hashes[i] === hashes[i - 1]) continue;
  if (i - s >= minRun && s + from < holdFrame) frozen.push({ at: +((s + from) / FPS).toFixed(3), seconds: +((i - s) / FPS).toFixed(3) });
  s = i;
}

// 5) encode video
await mkdir(OUT, { recursive: true });
const video = join(OUT, `${NAME}.mp4`);
const silent = join(FRAMES, "video.mp4");
const tEnc = Date.now();
await ffmpeg(["-y", "-framerate", String(FPS), "-i", join(FRAMES, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", DRAFT ? "23" : "16", "-preset", DRAFT ? "veryfast" : "slow", "-movflags", "+faststart", silent]);

// 6) audio: synthesized music + SFX from window.AUDIO, or a supplied track under the SFX
let audioInfo = null;
if (!flag("no-audio") && META.audio && from === 0) {
  const sfxWav = join(FRAMES, "audio.wav");
  const music = arg("music", null);
  await renderAudio({ ...META.audio, duration: DURATION, music: music ? false : META.audio.music }, sfxWav);
  const master = "loudnorm=I=-14:TP=-2:LRA=11,aresample=48000,alimiter=limit=0.7:attack=1:release=60:level=false";
  if (music) {
    // user track: trimmed to the video, faded out, ducked under the SFX via sidechain
    await ffmpeg(["-y", "-i", silent, "-i", resolve(music), "-i", sfxWav, "-filter_complex",
      `[1:a]atrim=0:${DURATION},afade=t=out:st=${Math.max(0, DURATION - 1.2)}:d=1.2,volume=0.8,aresample=48000[m];[2:a]asplit=2[s][sc];[m][sc]sidechaincompress=threshold=0.05:ratio=6:attack=5:release=250[md];[md][s]amix=inputs=2:normalize=0,${master}[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", video]);
  } else {
    await ffmpeg(["-y", "-i", silent, "-i", sfxWav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", master, "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", video]);
  }
  audioInfo = { cues: META.audio.cues.length, music: music ? basename(music) : META.audio.music, ...loudness(video) };
} else {
  await copyFile(silent, video);
}
const encodeSecs = (Date.now() - tEnc) / 1000;

// 7) review frames + contact sheet (look at out/contact.png before delivering)
const REVIEW = join(OUT, "review");
await rm(REVIEW, { recursive: true, force: true });
await mkdir(REVIEW, { recursive: true });
const keys = Object.entries({ ...META.review, zz_final: DURATION }).sort((a, b) => a[1] - b[1]);
const tmpSheet = join(FRAMES, "sheet");
await mkdir(tmpSheet, { recursive: true });
let n = 0;
for (const [name, t] of keys) {
  const i = Math.max(0, Math.min(total - 1, Math.round(t * FPS) - from));
  const src = join(FRAMES, `${String(i).padStart(5, "0")}.png`);
  await ffmpeg(["-y", "-i", src, "-vf", `scale=${Math.round(SIZE.width / 2)}:-2`, join(REVIEW, `${String(n + 1).padStart(2, "0")}-${name.replace(/^\d+-/, "")}@${t.toFixed(2)}s.png`)]);
  await copyFile(src, join(tmpSheet, `${String(n).padStart(3, "0")}.png`));
  n++;
}
const cols = Math.min(n, SIZE.width < SIZE.height ? 6 : 4);
await ffmpeg(["-y", "-framerate", "1", "-i", join(tmpSheet, "%03d.png"), "-vf", `scale=${SIZE.width < SIZE.height ? 360 : 640}:-2,pad=iw+12:ih+12:6:6:white,tile=${cols}x${Math.ceil(n / cols)}:color=white`, "-frames:v", "1", join(OUT, `contact${DRAFT ? ".draft" : ""}.png`)]);

// 8) report
const info = probe(video);
const report = {
  video: video, size: `${SIZE.width}x${SIZE.height}`, fps: FPS, frames: total, duration: Number(info.format.duration),
  holdFrom: META.hold, frozen, layout, fontsNotLoaded: fontUnused, audio: audioInfo,
  timing: { captureSecs: +captureSecs.toFixed(1), encodeSecs: +encodeSecs.toFixed(1), totalSecs: +((Date.now() - t0) / 1000).toFixed(1) },
};
await writeFile(join(OUT, `report${DRAFT ? ".draft" : ""}.json`), JSON.stringify(report, null, 2));
if (!DRAFT) await rm(FRAMES, { recursive: true, force: true });

console.log(frozen.length ? `⚠ frozen stretches before the final hold: ${frozen.map((f) => `${f.at}s (${f.seconds}s)`).join(", ")}` : "✓ no frozen frames before the final hold");
if (layout.length) console.log(`⚠ layout (check these on the review frames — some may be intentional, e.g. objects entering):
  ${[...new Set(layout)].slice(0, 20).join("\n  ")}`);
else console.log("✓ no clipped text, all text inside the safe area at review frames");
if (fontUnused.length) console.log(`ℹ declared but unused font families: ${fontUnused.join(", ")}`);
if (audioInfo) console.log(`✓ audio: ${audioInfo.cues} cues · ${audioInfo.lufs} LUFS · peak ${audioInfo.peak} dBFS`);
console.log(`✓ ${video}\n✓ ${join(OUT, `contact${DRAFT ? ".draft" : ""}.png`)}  (${n} review frames)\n  capture ${captureSecs.toFixed(0)} s · encode ${encodeSecs.toFixed(0)} s`);
