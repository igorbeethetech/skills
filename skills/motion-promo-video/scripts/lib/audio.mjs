// Deterministic soundtrack + SFX synthesizer for motion-design videos (no samples, no licensing, offline).
// Input: { duration, seed, music: { bpm, key, mode, intro, drop, end } | false, cues: [{ t, type, gain?, pitch?, dur?, pan?, dir? }] }
// Output: 48 kHz stereo 16-bit WAV. Same input => same audio.
// SFX types: click tick type pop whoosh swoosh riser thud kick stamp deal lift snap flip impact cheer scribble sparkle chime logo
// Usage: import { renderAudio } from "./audio.mjs"   |   node audio.mjs spec.json out.wav
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SR = 48000;
const TAU = Math.PI * 2;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ——— building blocks ———
class Bus {
  constructor(seconds) { this.n = Math.ceil(seconds * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  /** mixes a mono signal at t (s) with gain and constant-power pan (-1..1) */
  add(t, sig, gain = 1, pan = 0) {
    const s0 = Math.round(t * SR), gl = Math.cos((pan + 1) * Math.PI / 4) * gain * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * gain * Math.SQRT2;
    for (let i = 0; i < sig.length; i++) { const k = s0 + i; if (k < 0 || k >= this.n) continue; this.L[k] += sig[i] * gl; this.R[k] += sig[i] * gr; }
  }
  /** same, with time-varying pan (panFn(i/len)) */
  addPanned(t, sig, gain, panFn) {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < sig.length; i++) {
      const k = s0 + i; if (k < 0 || k >= this.n) continue;
      const p = panFn(i / sig.length), a = (p + 1) * Math.PI / 4;
      this.L[k] += sig[i] * Math.cos(a) * gain * Math.SQRT2; this.R[k] += sig[i] * Math.sin(a) * gain * Math.SQRT2;
    }
  }
}
const len = (s) => Math.max(1, Math.round(s * SR));
const expEnv = (i, n, decay) => Math.exp(-i / (decay * SR)) * (i < n ? 1 : 0);
const atk = (i, a) => Math.min(1, i / Math.max(1, a * SR));
function sine(dur, f0, f1 = f0, decay = dur, attack = 0.002, glide = 0.05) {
  const n = len(dur), out = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const f = f1 + (f0 - f1) * Math.exp(-i / (glide * SR)); ph += TAU * f / SR; out[i] = Math.sin(ph) * atk(i, attack) * Math.exp(-i / (decay * SR)); }
  return out;
}
function noise(dur, rnd) { const n = len(dur), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rnd() * 2 - 1; return o; }
/** RBJ biquad with time-varying cutoff (fFn(p) in Hz, p 0..1) */
function biquad(sig, type, fFn, q = 0.9) {
  const out = new Float32Array(sig.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < sig.length; i++) {
    if (i % 32 === 0) {
      const f = Math.min(SR * 0.45, Math.max(20, fFn(i / sig.length))), w = TAU * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
      if (type === "bp") { b0 = al / a0; b1 = 0; b2 = -al / a0; }
      else if (type === "lp") { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
      else { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
      a1 = -2 * c / a0; a2 = (1 - al) / a0;
    }
    const y = b0 * sig[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = sig[i]; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
const mul = (sig, fn) => { for (let i = 0; i < sig.length; i++) sig[i] *= fn(i, sig.length); return sig; };
const mix = (...sigs) => { const n = Math.max(...sigs.map((s) => s.length)), o = new Float32Array(n); for (const s of sigs) for (let i = 0; i < s.length; i++) o[i] += s[i]; return o; };
const scale = (sig, g) => { for (let i = 0; i < sig.length; i++) sig[i] *= g; return sig; };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// ——— sound effects ———
function makeSfx(rnd) {
  const bell = (f, dur = 1.2) => mix(scale(sine(dur, f, f, dur * 0.5), 0.6), scale(sine(dur, f * 2.76, f * 2.76, dur * 0.25), 0.25), scale(sine(dur, f * 5.4, f * 5.4, dur * 0.12), 0.12));
  return {
    click: () => mix(scale(sine(0.04, 3200, 2400, 0.012, 0.0005), 0.7), scale(biquad(mul(noise(0.006, rnd), (i, n) => 1 - i / n), "hp", () => 4000), 0.5)),
    tick: () => scale(sine(0.02, 2600, 2600, 0.006, 0.0005), 0.6),
    type: (o) => scale(sine(0.02, 1800 * (o.pitch ?? 1), 1500, 0.007, 0.0005), 0.5),
    pop: (o) => { const p = o.pitch ?? 1; return mix(sine(0.12, 1150 * p, 380 * p, 0.05, 0.002, 0.025), scale(biquad(mul(noise(0.02, rnd), (i, n) => 1 - i / n), "bp", () => 2500, 1.2), 0.2)); },
    whoosh: (o) => { const d = o.dur ?? 0.45, up = o.dir !== "down";
      return mul(biquad(noise(d, rnd), "bp", (p) => (up ? 350 + 2600 * p * p : 2800 - 2400 * p), 1.4), (i, n) => { const p = i / n; return Math.sin(Math.PI * Math.pow(p, up ? 0.8 : 1.3)) ** 2; }); },
    swoosh: (o) => { const d = o.dur ?? 0.22; return mul(biquad(noise(d, rnd), "bp", (p) => 1800 + 4000 * p, 1.8), (i, n) => Math.sin(Math.PI * i / n) ** 2); },
    riser: (o) => { const d = o.dur ?? 0.8;
      return mix(mul(biquad(noise(d, rnd), "bp", (p) => 300 + 5200 * p * p, 1.2), (i, n) => Math.pow(i / n, 2.2)),
        mul(sine(d, 180, 900, 99, 0.01, d * SR > 0 ? d * 0.6 : 1), (i, n) => 0.25 * Math.pow(i / n, 2))); },
    thud: (o) => mix(sine(0.25, 150 * (o.pitch ?? 1), 52, 0.07, 0.001, 0.03), scale(biquad(mul(noise(0.03, rnd), (i, n) => 1 - i / n), "lp", () => 900), 0.6)),
    kick: () => mix(sine(0.3, 170, 50, 0.09, 0.001, 0.03), scale(biquad(mul(noise(0.05, rnd), (i, n) => (1 - i / n) ** 2), "bp", () => 1400, 0.8), 0.7)),
    stamp: () => mix(scale(sine(0.35, 90, 38, 0.12, 0.001, 0.04), 1.1), scale(biquad(mul(noise(0.08, rnd), (i, n) => (1 - i / n) ** 3), "bp", () => 1100, 0.7), 0.9),
      scale(sine(0.05, 2300, 1800, 0.015, 0.0005), 0.35)),
    deal: () => mix(scale(mul(biquad(noise(0.1, rnd), "hp", () => 3000), (i, n) => Math.sin(Math.PI * i / n) ** 2), 0.8), scale(sine(0.05, 700, 400, 0.02), 0.25)),
    lift: () => mul(biquad(noise(0.28, rnd), "bp", (p) => 600 + 1400 * p, 1.1), (i, n) => Math.sin(Math.PI * i / n) * 0.8),
    snap: () => mix(sine(0.2, 200, 70, 0.05, 0.001, 0.02), scale(sine(0.04, 2600, 2000, 0.012, 0.0005), 0.5)),
    flip: () => mix(mul(biquad(noise(0.12, rnd), "bp", () => 2600, 1.5), (i, n) => Math.sin(Math.PI * i / n) ** 2),
      mul(biquad(noise(0.24, rnd), "bp", () => 1700, 1.5), (i, n) => (i / n > 0.5 ? Math.sin(Math.PI * (i / n - 0.5) * 2) ** 2 : 0))),
    impact: () => mix(scale(sine(1.6, 110, 42, 0.55, 0.001, 0.08), 1.2), scale(sine(1.2, 62, 48, 0.5), 0.6),
      scale(mul(biquad(noise(1.8, rnd), "hp", (p) => 5000 - 3000 * p), (i) => Math.exp(-i / (0.55 * SR))), 0.45),
      scale(biquad(mul(noise(0.06, rnd), (i, n) => 1 - i / n), "lp", () => 1500), 0.9)),
    cheer: (o) => { // crowd: noise bands with slow seeded amplitude modulation
      const d = o.dur ?? 2.2, bands = [320, 480, 700, 950, 1300, 1800, 2400, 3100], parts = [];
      for (const f of bands) {
        const ph = rnd() * TAU, rate = 2.5 + rnd() * 5;
        parts.push(scale(mul(biquad(noise(d, rnd), "bp", () => f * (0.9 + rnd() * 0.2), 2.2), (i) => 0.65 + 0.35 * Math.sin(ph + TAU * rate * i / SR)), 1 / Math.sqrt(f / 300)));
      }
      return mul(mix(...parts), (i, n) => Math.min(1, i / (0.25 * SR)) * Math.min(1, (n - i) / (1.2 * SR)));
    },
    scribble: (o) => { // pencil/marker on paper: bright noise with a fast jittery envelope
      const d = o.dur ?? 0.5, ph = rnd() * TAU;
      return mul(biquad(noise(d, rnd), "bp", (p) => 3200 + 1400 * Math.sin(ph + p * 9), 1.3), (i, n) => {
        const p = i / n, grain = 0.55 + 0.45 * Math.abs(Math.sin(ph + (i / SR) * TAU * 11));
        return grain * Math.min(1, p * 12) * Math.min(1, (1 - p) * 6);
      });
    },
    sparkle: () => { const parts = []; for (let k = 0; k < 9; k++) { const s = sine(0.12, 2200 + rnd() * 3200, undefined, 0.04, 0.001); const pad = new Float32Array(Math.round(rnd() * 0.6 * SR)); parts.push(scale(Float32Array.from([...pad, ...s]), 0.35)); } return mix(...parts); },
    chime: (o) => { const root = o.root ?? 76; return mix(...[0, 4, 7, 12].map((iv, k) => { const s = bell(hz(root + iv)); const pad = new Float32Array(Math.round(k * 0.075 * SR)); return scale(Float32Array.from([...pad, ...s]), 0.4); })); },
    logo: (o) => mix(scale(sine(1.2, 90, 45, 0.4, 0.002, 0.06), 0.9), ...[0, 7, 12, 16].map((iv) => scale(bell(hz((o.root ?? 69) + iv), 2), 0.25))),
  };
}

// ——— music bed ———
const KEYS = { C: 60, "C#": 61, D: 62, "D#": 63, E: 64, F: 65, "F#": 66, G: 67, "G#": 68, A: 69, "A#": 70, B: 71 };
function renderMusic(bus, m, duration, rnd) {
  const beat = 60 / m.bpm, bar = beat * 4;
  // beat grid aligned so the drop lands on a downbeat
  const drop = m.drop ?? duration * 0.6, end = m.end ?? duration - 1.5, intro = m.intro ?? Math.min(2.4, drop);
  const t0 = drop - Math.ceil(drop / bar) * bar;
  const root = KEYS[m.key ?? "A"] - 12, minor = m.mode === "minor";
  const prog = minor ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]] : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // i–VI–III–VII | I–V–vi–IV
  const kickS = sine(0.32, 150, 45, 0.11, 0.001, 0.028);
  const clapS = () => mul(biquad(noise(0.18, rnd), "bp", () => 1500, 0.9), (i) => { const t = i / SR; return (t < 0.01 ? 1 : t < 0.02 ? 0.6 : 1) * Math.exp(-t / 0.05); });
  const hatS = (open) => mul(biquad(noise(open ? 0.2 : 0.045, rnd), "hp", () => 7500), (i) => Math.exp(-i / ((open ? 0.07 : 0.012) * SR)));
  const saw = (f, dur, det = 0) => { const n = len(dur), o = new Float32Array(n); let ph = rnd(); for (let i = 0; i < n; i++) { ph += f * (1 + det) / SR; o[i] = 2 * (ph % 1) - 1; } return o; };
  const duckTimes = [];
  for (let t = t0, b = 0; t < duration; t += beat, b++) {
    if (t < -0.01) continue;
    const barIdx = Math.floor((t - t0) / bar), chord = prog[((barIdx % 4) + 4) % 4], inBar = b % 4;
    const phase = t < intro ? "intro" : t < drop - beat * 0.5 ? "groove" : t < end ? "drop" : "outro";
    const gapBeforeDrop = t >= drop - beat * 0.5 && t < drop; // half-beat of silence right before the drop
    if (phase === "outro") break;
    // drums
    if (phase !== "intro" && !gapBeforeDrop) { bus.add(t, kickS, phase === "drop" ? 0.95 : 0.8); duckTimes.push(t); }
    if (phase !== "intro" && !gapBeforeDrop && (inBar === 1 || inBar === 3)) bus.add(t, clapS(), 0.4, 0.05);
    if (!gapBeforeDrop) {
      bus.add(t + beat / 2, hatS(inBar === 3 && phase === "drop"), phase === "intro" ? 0.12 : 0.2, 0.25);
      if (phase === "drop") bus.add(t + beat / 4, hatS(false), 0.07, -0.25), bus.add(t + beat * 0.75, hatS(false), 0.07, -0.25);
    }
    // eighth-note bass (not in the intro)
    if (phase !== "intro" && !gapBeforeDrop) for (const off of [0, 0.5]) {
      const f = hz(root - 12 + chord[0]), s = biquad(mix(saw(f, beat * 0.45), scale(saw(f, beat * 0.45, 0.004), 0.7)), "lp", (p) => 900 - 500 * p, 0.8);
      bus.add(t + off * beat, mul(s, (i, n) => atk(i, 0.004) * Math.exp(-i / (0.18 * SR))), 0.22);
    }
    // chords: filtered pad in the intro, off-beat stabs afterwards
    if (phase === "intro" && inBar === 0) {
      const dur = Math.min(bar, intro - t + 0.4);
      for (const iv of chord) { const f = hz(root + 12 + iv); const s = biquad(mix(saw(f, dur, -0.006), saw(f, dur, 0.006)), "lp", (p) => 500 + 1800 * p, 0.7);
        bus.add(t, mul(s, (i, n) => Math.min(1, i / (0.3 * SR)) * Math.min(1, (n - i) / (0.2 * SR))), 0.05, iv % 2 ? 0.3 : -0.3); }
    }
    if (phase !== "intro" && !gapBeforeDrop) {
      for (const iv of chord) { const f = hz(root + 12 + iv); const s = biquad(mix(saw(f, beat * 0.3, -0.007), saw(f, beat * 0.3, 0.007)), "lp", () => (phase === "drop" ? 3200 : 2200), 0.7);
        bus.add(t + beat / 2, mul(s, (i) => atk(i, 0.003) * Math.exp(-i / (0.09 * SR))), phase === "drop" ? 0.07 : 0.055, iv % 2 ? 0.35 : -0.35); }
    }
    // arpeggio melody in the drop
    if (phase === "drop") for (let k = 0; k < 2; k++) {
      const note = root + 24 + chord[(inBar * 2 + k) % 3], s = mix(sine(beat * 0.45, hz(note), hz(note), 0.12), scale(sine(beat * 0.45, hz(note) * 2, hz(note) * 2, 0.05), 0.3));
      bus.add(t + k * beat / 2, s, 0.09, k ? 0.4 : -0.4);
    }
  }
  // final chord at `end`, ringing out to the last frame
  const endDur = Math.max(0.5, duration - end);
  const fin = prog[0];
  for (const iv of [...fin, 12]) { const f = hz(root + 12 + iv), s = biquad(mix(saw(f, endDur, -0.006), saw(f, endDur, 0.006), scale(saw(f / 2, endDur), 0.5)), "lp", (p) => 2600 - 1800 * p, 0.7);
    bus.add(end, mul(s, (i, n) => atk(i, 0.01) * Math.exp(-i / (1.6 * SR))), 0.06, iv % 2 ? 0.3 : -0.3); }
  bus.add(end, kickS, 0.9);
  return duckTimes;
}

// ——— simple Schroeder reverb on the SFX bus ———
function reverb(bus, wet = 0.18) {
  const combs = [1557, 1617, 1491, 1422], aps = [225, 556];
  for (const ch of [bus.L, bus.R]) {
    const dry = Float32Array.from(ch), out = new Float32Array(ch.length);
    for (const [k, d0] of combs.entries()) { const d = d0 + (ch === bus.R ? 23 : 0), buf = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < ch.length; i++) { const y = buf[idx]; lp = y * 0.8 + lp * 0.2; buf[idx] = dry[i] + lp * 0.78; idx = (idx + 1) % d; out[i] += y / combs.length; } void k; }
    for (const d of aps) { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < out.length; i++) { const b = buf[idx], y = -out[i] + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % d; out[i] = y; } }
    for (let i = 0; i < ch.length; i++) ch[i] = dry[i] + out[i] * wet;
  }
}

export async function renderAudio(spec, outPath) {
  const duration = spec.duration;
  const rnd = mulberry32(spec.seed ?? 1337);
  const music = new Bus(duration), sfx = new Bus(duration);
  const S = makeSfx(rnd);
  // default gain per effect type (mix balance)
  const G = { click: 0.5, tick: 0.25, type: 0.22, pop: 0.35, whoosh: 0.32, swoosh: 0.22, riser: 0.35, thud: 0.6, kick: 0.7, stamp: 0.85, deal: 0.4, lift: 0.28,
    snap: 0.55, flip: 0.45, impact: 1.0, cheer: 0.55, scribble: 0.22, sparkle: 0.3, chime: 0.45, logo: 0.8 };
  const heavy = [];
  for (const c of spec.cues ?? []) {
    const gen = S[c.type]; if (!gen) { console.warn(`unknown sfx type: ${c.type}`); continue; }
    const sig = gen(c), g = (c.gain ?? 1) * (G[c.type] ?? 0.4);
    if (c.type === "whoosh" || c.type === "swoosh") sfx.addPanned(c.t, sig, g, (p) => (c.pan ?? -0.5) + p * 2 * Math.abs(c.pan ?? -0.5));
    else sfx.add(c.t, sig, g, c.pan ?? 0);
    if (["impact", "stamp", "cheer", "logo"].includes(c.type)) heavy.push({ t: c.t, dur: c.type === "cheer" ? c.dur ?? 2.2 : 0.8 });
  }
  reverb(sfx, 0.16);
  let kicks = [];
  if (spec.music !== false) kicks = renderMusic(music, spec.music ?? {}, duration, rnd);
  // sidechain: music pumps with the kick and ducks under heavy effects
  const duck = new Float32Array(music.n).fill(1);
  for (const t of kicks) { const s0 = Math.round(t * SR); for (let i = 0; i < 0.18 * SR && s0 + i < duck.length; i++) duck[s0 + i] = Math.min(duck[s0 + i], 0.75 + 0.25 * (i / (0.18 * SR))); }
  for (const h of heavy) { const s0 = Math.round(h.t * SR), n = Math.round((h.dur + 0.3) * SR); for (let i = 0; i < n && s0 + i < duck.length; i++) duck[s0 + i] = Math.min(duck[s0 + i], 0.55 + 0.45 * Math.max(0, (i - h.dur * SR) / (0.3 * SR))); }
  // fades, sum and soft limiter
  const n = music.n, pcm = Buffer.alloc(n * 4), mg = spec.musicGain ?? 0.8, fg = spec.sfxGain ?? 1;
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / (0.03 * SR), (n - i) / (0.35 * SR));
    for (const [ch, off] of [[0, 0], [1, 2]]) {
      const x = ((ch ? music.R : music.L)[i] * duck[i] * mg + (ch ? sfx.R : sfx.L)[i] * fg) * fade;
      const y = Math.tanh(x * 1.1) * 0.95;
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, y)) * 32767), i * 4 + off);
    }
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8); head.write("fmt ", 12); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  await writeFile(outPath, Buffer.concat([head, pcm]));
  return outPath;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const spec = JSON.parse(await readFile(process.argv[2], "utf8"));
  await renderAudio(spec, process.argv[3] ?? "audio.wav");
  console.log(`✓ ${process.argv[3] ?? "audio.wav"}`);
}
