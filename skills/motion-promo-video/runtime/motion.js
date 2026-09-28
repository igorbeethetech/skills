/*!
 * motion.js — deterministic motion-design runtime for promo videos (motion-promo-video skill).
 * One paused GSAP timeline drives everything; every helper also registers a sound cue at the same instant,
 * so the synthesized soundtrack is always in sync. Exposes to the renderer:
 *   window.READY (Promise<duration>), window.DURATION, window.seek(t), window.SIZE,
 *   window.HOLD_FROM, window.REVIEW ({name: t}), window.AUDIO ({seed, music, cues}).
 * Rules: no Math.random / Date.now / setTimeout / CSS animations in scenes — everything is a function of t.
 */
(function () {
  "use strict";
  const cfg = { size: [1080, 1920], fonts: [], seed: 1, music: { bpm: 120, key: "A", mode: "major" }, sfx: true, lang: "pt-BR" };
  let builder = null;

  // ——— deterministic PRNG ———
  function prng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ——— copy / i18n helpers (run before build) ———
  /** Picks the language from ?lang=… (falls back to cfg.lang) and fills [data-t] elements. */
  function copy(dict) {
    const want = new URLSearchParams(location.search).get("lang");
    const lang = dict[want] ? want : dict[cfg.lang] ? cfg.lang : Object.keys(dict)[0];
    const T = dict[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((el) => {
      const v = el.dataset.t.split(".").reduce((o, k) => (o == null ? o : o[k]), T);
      if (v != null) el.innerHTML = v;
    });
    return T;
  }
  /** Headline markup: each line masked; *word* = accent highlighter, ^word^ = second highlighter. */
  function lines(target, arr) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    el.innerHTML = arr.map((l) => `<span class="ln"><span>${l
      .replace(/\*(.+?)\*/g, '<span class="hl"><i class="mark"></i>$1</span>')
      .replace(/\^(.+?)\^/g, '<span class="hl"><i class="mark mark-2"></i>$1</span>')}</span></span>`).join("");
    return el;
  }
  /** Splits an element's text into per-letter spans (for M.type). */
  function letters(target) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    const txt = el.textContent;
    el.textContent = "";
    const svg = el instanceof SVGElement;
    for (const c of txt) { const s = svg ? document.createElementNS("http://www.w3.org/2000/svg", "tspan") : document.createElement("span"); s.textContent = c; s.setAttribute("class", "lt"); el.appendChild(s); }
    return el;
  }

  // ——— runtime CSS (cursor, ripple, fx) ———
  const CSS = `
    .ln{display:block;overflow:hidden;white-space:nowrap;line-height:1;padding:.1em .08em .03em;margin-top:-.14em}
    .ln>span{display:inline-block}
    .hl{position:relative;z-index:0;display:inline-block;padding:0 .06em}
    .mark{position:absolute;left:-.02em;right:-.02em;top:.16em;bottom:.02em;background:var(--accent,#c4f23a);z-index:-1;transform-origin:0 50%;border-radius:.06em}
    .mark.mark-2{background:var(--accent-2,#f4c542)}
    #m-cursor{position:absolute;left:0;top:0;width:84px;height:84px;margin:-9px 0 0 -11px;z-index:900;transform-origin:11px 9px;opacity:0;visibility:hidden;filter:drop-shadow(0 10px 14px rgba(0,0,0,.35))}
    #m-ripple{position:absolute;left:0;top:0;width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;z-index:899;border:8px solid var(--brand,#0e6a3b);background:color-mix(in srgb,var(--accent,#c4f23a) 35%,transparent);opacity:0}
    #m-fx{position:absolute;inset:0;pointer-events:none;z-index:800}
    .m-confetti{position:absolute;left:0;top:0;width:22px;height:40px;border-radius:5px;opacity:0}
    .m-fill{position:absolute;inset:-160px;visibility:hidden}
    #m-flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:950;pointer-events:none}`;

  function init(c) { Object.assign(cfg, c || {}); }
  function build(fn) { builder = fn; }

  function makeApi(tl, stage, cam, snap) {
    const $ = (s) => (typeof s === "string" ? document.querySelector(s) : s);
    const $$ = (s) => (typeof s === "string" ? [...document.querySelectorAll(s)] : Array.isArray(s) ? s : [s]);
    const cues = [], review = {};
    const music = { ...cfg.music };
    let hold = null, popIdx = 0;
    const W = cfg.size[0], H = cfg.size[1];
    const sfx = (type, t, o = {}) => { if (cfg.sfx && o.sfx !== false) cues.push({ t: +t.toFixed(4), type, ...o }); };

    // cursor/ripple/fx/flash live inside the camera (they zoom with the scene, like a screen-recording zoom)
    const mk = (id, parent, html = "") => { let el = document.getElementById(id); if (!el) { el = document.createElement("div"); el.id = id; el.innerHTML = html; parent.appendChild(el); } return el; };
    const fx = mk("m-fx", cam);
    const ripple = mk("m-ripple", cam);
    const cursorEl = mk("m-cursor", cam, `<svg viewBox="0 0 24 24" width="84" height="84"><path d="M4 3l15 7.2-6.4 1.7-2.9 6.1z" fill="var(--cursor,#13241b)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
    const flashEl = mk("m-flash", stage);

    // ——— measuring (ALWAYS before tweening the element or its ancestors) ———
    // Geometry comes from a snapshot taken before build() ran, so it's never polluted by tweens that already
    // applied their starting state (fromTo/from render immediately). Elements created during build are measured live.
    const rect = (sel) => { const el = $(sel); const r = snap.get(el) ?? el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
    const center = (sel, dx = 0, dy = 0) => { const r = rect(sel); return { x: r.cx + dx, y: r.cy + dy }; };
    function measure(map) { const o = {}; for (const [k, s] of Object.entries(map)) o[k] = rect(s); return o; }

    // ——— scenes ———
    const autoReview = []; // [name, t] — one frame per beat for the contact sheet; add more with M.review()
    const mark = (name, t) => autoReview.push([String(name).replace(/[^a-z0-9]+/gi, ""), t]);
    function show(sel, t, { review: rv = true } = {}) { tl.set(sel, { autoAlpha: 1 }, t); if (rv) mark(sel, t + 0.9); }
    const hide = (sel, t) => tl.set(sel, { autoAlpha: 0 }, t);

    // ——— text ———
    function head(sel, t, { stagger = 0.09, sfx: s = true } = {}) {
      tl.fromTo(`${sel} .ln > span`, { yPercent: 115, rotation: 3 }, { yPercent: 0, rotation: 0, duration: 0.7, ease: "power4.out", stagger }, t);
      tl.fromTo(`${sel} .mark`, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.inOut" }, t + 0.38);
      if (s) { sfx("whoosh", t, { dur: 0.5, gain: 0.8 }); if ($(`${sel} .mark`).length) sfx("swoosh", t + 0.38, { gain: 0.6 }); }
      mark(sel, t + 1.0);
    }
    function headOut(sel, t, { sfx: s = true } = {}) {
      tl.to(`${sel} .ln > span`, { yPercent: -115, duration: 0.42, ease: "power3.in", stagger: 0.05 }, t);
      if (s) sfx("whoosh", t, { dir: "down", gain: 0.6 });
    }
    function type(sel, t, { every = 0.07, sfx: s = true } = {}) {
      const el = $(sel); if (!el.querySelector(".lt")) letters(el);
      const kids = [...el.querySelectorAll(".lt")];
      kids.forEach((k, i) => { tl.set(k, { opacity: 0 }, 0); tl.set(k, { opacity: 1 }, t + i * every); if (s && k.textContent.trim()) sfx("type", t + i * every, { pitch: 1 + (i % 3) * 0.06 }); });
    }
    function count(sel, from, to, t, dur, { fmt = (v) => Math.round(v), tick = 0.1, onValue, sfx: s = true } = {}) {
      const el = $(sel), o = { v: from };
      tl.fromTo(o, { v: from }, { v: to, duration: dur, ease: "power2.inOut", onUpdate() { el.textContent = fmt(o.v); if (onValue) onValue(o.v); } }, t);
      if (s) for (let k = 0; k * tick <= dur; k++) sfx("tick", t + k * tick, { gain: 0.6 + 0.4 * (k * tick) / dur });
    }

    // ——— objects ———
    function pop(sel, t, { stagger = 0.06, rotation, scale = 0, from = "start", sfx: s = true, pitch = 1 } = {}) {
      const els = $$(sel);
      tl.fromTo(els, { scale, autoAlpha: 0, rotation: (i, el) => (rotation ? rotation(i, el) * 4 : 0) },
        { scale: 1, autoAlpha: 1, rotation: (i, el) => (rotation ? rotation(i, el) : 0), duration: 0.55, ease: "back.out(2.2)", stagger: { each: stagger, from } }, t);
      if (s) els.forEach((_, i) => sfx("pop", t + i * stagger, { pitch: pitch * (0.9 + ((popIdx + i) % 6) * 0.08), pan: i % 2 ? 0.4 : -0.4 }));
      popIdx += els.length;
    }
    function rise(sel, t, { y = 60, stagger = 0.06, dur = 0.5, sfx: s = false } = {}) {
      tl.fromTo(sel, { y, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: dur, ease: "back.out(2)", stagger }, t);
      if (s) sfx("swoosh", t, { gain: 0.5 });
    }
    /** 3D entrance: tilts in from rotationX (card lying down) or rotationY (turning page). */
    function tilt(sel, t, { axis = "x", deg = 55, y = 240, dur = 0.8, sfx: s = true } = {}) {
      const k = axis === "x" ? "rotationX" : "rotationY";
      tl.fromTo(sel, { [k]: deg, y, scale: 0.9, autoAlpha: 0 }, { [k]: 0, y: 0, scale: 1, autoAlpha: 1, duration: dur, ease: "back.out(1.3)" }, t);
      if (s) sfx(axis === "x" ? "whoosh" : "flip", t, { gain: 0.6 });
    }
    /** Draw-on for SVG strokes (paths, lines, circles, rects…): stroke-dashoffset from full length to 0. */
    function draw(sel, t, { dur = 0.6, stagger = 0.12, ease = "power2.inOut", sfx: s = true } = {}) {
      $(sel).forEach((el, i) => {
        const len = Math.ceil(el.getTotalLength ? el.getTotalLength() : 1000) + 2;
        tl.fromTo(el, { attr: { "stroke-dasharray": len, "stroke-dashoffset": len } }, { attr: { "stroke-dashoffset": 0 }, duration: dur, ease }, t + i * stagger);
        if (s) sfx("scribble", t + i * stagger, { dur: dur * 0.9, pan: i % 2 ? 0.3 : -0.3 });
      });
    }
    /** Idle float: every visible object keeps breathing so no frame is ever frozen. */
    function idle(sel, t, dur, { amp = 14, rot = 1.2, period = 1.3, stagger = 0.18 } = {}) {
      const n = Math.max(1, Math.round(dur / period));
      tl.fromTo(sel, { y: 0, rotation: 0 }, { y: -amp, rotation: rot, duration: dur / n, ease: "sine.inOut", yoyo: true, repeat: n - 1, stagger: { each: stagger } }, t);
    }
    function stamp(sel, t, { rot = -6, shakeTarget, sfx: s = true } = {}) {
      tl.fromTo(sel, { scale: 2.6, rotation: rot * 2.6, autoAlpha: 0 }, { scale: 1, rotation: rot, autoAlpha: 1, duration: 0.42, ease: "back.out(2.2)" }, t);
      if (shakeTarget) shake(shakeTarget, t + 0.3, { sfx: false });
      if (s) sfx("stamp", t + 0.1);
    }
    function shake(sel, t, { px = 14, dur = 0.34, sfx: s = false } = {}) {
      tl.to(sel, { keyframes: { x: [px * 0.7, -px, px * 0.6, -px * 0.25, 0], y: [-px * 0.45, px * 0.6, -px * 0.3, px * 0.15, 0] }, duration: dur, ease: "none" }, t);
      if (s) sfx("thud", t);
    }
    function flash(t, { dur = 0.5 } = {}) { tl.fromTo(flashEl, { opacity: 0.95 }, { opacity: 0, duration: dur, ease: "power2.out", immediateRender: false }, t); }
    function confetti(pt, t, { n = 64, colors = ["var(--accent,#c4f23a)", "var(--accent-2,#f4c542)", "var(--brand,#0e6a3b)", "var(--ink,#13241b)"], seed = cfg.seed + 7, spread = 1.5, sfx: s = true } = {}) {
      const r = prng(seed);
      for (let i = 0; i < n; i++) {
        const el = document.createElement("i"); el.className = "m-confetti"; el.style.background = colors[i % colors.length]; fx.appendChild(el);
        const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * spread, v = 500 + r() * 700, d = r() * 0.12, sc = 0.6 + r() * 0.8, rot = r() * 360, spin = (r() - 0.5) * 1440, fall = 900 + r() * 700;
        const up = Math.sin(a) * v * 0.9, t0 = t + d;
        tl.fromTo(el, { x: pt.x, y: pt.y, scale: sc, rotation: rot, opacity: 1 }, { x: pt.x + Math.cos(a) * v, rotation: rot + spin, duration: 1.7, ease: "power2.out", immediateRender: false }, t0)
          .to(el, { y: pt.y + up, duration: 0.5, ease: "power2.out" }, t0)
          .to(el, { y: pt.y + up + fall, duration: 1.2, ease: "power2.in" }, t0 + 0.5)
          .to(el, { opacity: 0, duration: 0.35, ease: "power1.in" }, t0 + 1.35); // never leave debris on later scenes
      }
      if (s) sfx("sparkle", t);
    }

    // ——— camera ———
    /** Centers point (x,y) at zoom s without showing the stage edge. */
    function camFocus(x, y, s, t, dur = 0.9, ease = "power3.inOut") {
      const tx = gsap.utils.clamp(W - W * s, 0, W / 2 - x * s), ty = gsap.utils.clamp(H - H * s, 0, H / 2 - y * s);
      tl.to(cam, { x: tx, y: ty, scale: s, rotation: 0, duration: dur, ease }, t);
    }
    /** Slow "breathing" push used on every scene (cheap way to kill static frames). */
    function breathe(t, dur, { from = 1, to = 1.05, rot = 0 } = {}) { // zoom around the frame center (camera origin is 0 0)
      tl.fromTo(cam, { scale: from, x: (W / 2) * (1 - from), y: (H / 2) * (1 - from), rotation: rot }, { scale: to, x: (W / 2) * (1 - to), y: (H / 2) * (1 - to), rotation: 0, duration: dur, ease: "power1.inOut" }, t);
    }
    const camReset = (t) => tl.set(cam, { scale: 1, x: 0, y: 0, rotation: 0 }, t);

    // ——— cursor ———
    let cur = { x: W + 120, y: H * 0.8 };
    const cursor = {
      in(t, from = { x: W + 120, y: H * 0.85 }) { tl.set(cursorEl, { x: from.x, y: from.y }, t - 0.001); cur = { ...from }; tl.to(cursorEl, { autoAlpha: 1, duration: 0.2 }, t); },
      out(t) { tl.to(cursorEl, { autoAlpha: 0, duration: 0.2 }, t); },
      /** quadratic Bézier path with power3.inOut easing (never linear) */
      move(to, t, dur = 0.8, bend = 0.25) {
        const from = { ...cur }, dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1, b = Math.min(260, d * bend);
        const c = { x: from.x + dx / 2 - (dy / d) * b, y: from.y + dy / 2 + (dx / d) * b }, p = { k: 0 };
        tl.fromTo(p, { k: 0 }, { k: 1, duration: dur, ease: "power3.inOut", onUpdate() {
          const k = p.k, u = 1 - k; gsap.set(cursorEl, { x: u * u * from.x + 2 * u * k * c.x + k * k * to.x, y: u * u * from.y + 2 * u * k * c.y + k * k * to.y });
        } }, t);
        cur = { ...to };
      },
      /** press: cursor squash, target squash 0.94 + overshoot, ripple */
      click(t, { target, at = cur, sfx: s = true } = {}) {
        tl.to(cursorEl, { scale: 0.82, duration: 0.08, ease: "power2.in" }, t).to(cursorEl, { scale: 1, duration: 0.3, ease: "back.out(3)" }, t + 0.1);
        if (target) tl.to(target, { scale: 0.94, duration: 0.08, ease: "power2.in" }, t).to(target, { scale: 1, duration: 0.5, ease: "back.out(3)" }, t + 0.08);
        tl.fromTo(ripple, { x: at.x, y: at.y, scale: 0.15, opacity: 1 }, { scale: 1.3, opacity: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, t);
        if (s) sfx("click", t);
      },
      /** drag `sel` (whose untransformed rect is `r`) to point `to`: lift (shadow grows, tilt) → travel → drop with overshoot */
      drag(sel, r, to, t, { dur = 0.6, grab = { x: 0, y: 30 }, shadow, sfx: s = true } = {}) {
        tl.to(cursorEl, { scale: 0.82, duration: 0.08 }, t);
        tl.to(sel, { scale: 1.12, rotation: -5, y: -70, z: 60, duration: 0.25, ease: "power2.out" }, t);
        if (shadow) tl.to(shadow, { y: 70, scale: 1.12, opacity: 0.7, duration: 0.25 }, t);
        tl.to(sel, { x: to.x - r.cx, y: to.y - r.cy, rotation: 4, duration: dur, ease: "power3.inOut" }, t + 0.2);
        cursor.move({ x: to.x + grab.x, y: to.y + grab.y }, t + 0.2, dur, 0.1);
        const d = t + 0.2 + dur;
        tl.to(sel, { scale: 1.06, rotation: 0, z: 0, duration: 0.45, ease: "back.out(3.4)" }, d);
        if (shadow) tl.to(shadow, { y: 0, scale: 1, opacity: 1, duration: 0.3 }, d);
        tl.to(cursorEl, { scale: 1, duration: 0.25, ease: "back.out(3)" }, d);
        tl.fromTo(ripple, { x: to.x, y: to.y, scale: 0.2, opacity: 1 }, { scale: 2.4, opacity: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, d);
        if (s) { sfx("lift", t); sfx("swoosh", t + 0.2, { dur, gain: 0.5 }); sfx("snap", d); }
        return d;
      },
      get pos() { return cur; },
    };

    // ——— transitions ———
    /** Solid circle grows from pt and covers the frame. Put `fill` (a .m-fill div) BETWEEN the leaving and entering scenes in the DOM. */
    function circleFill(fill, pt, t, { dur = 0.42, color = "var(--accent,#c4f23a)", sfx: s = true } = {}) {
      const el = $(fill); el.style.background = color;
      tl.set(el, { visibility: "visible", clipPath: `circle(0px at ${pt.x + 160}px ${pt.y + 160}px)` }, t); // .m-fill has inset:-160px
      tl.to(el, { clipPath: `circle(${Math.hypot(W, H) + 200}px at ${pt.x + 160}px ${pt.y + 160}px)`, duration: dur, ease: "power3.in" }, t);
      if (s) sfx("whoosh", t, { dur, gain: 0.9 });
      return { hideAt: (t2) => tl.set(el, { visibility: "hidden" }, t2) };
    }
    /** Circular reveal of an (opaque-background) scene. Use power2.inOut ~0.65s so it reads as a transition. */
    function reveal(sel, pt, t, { dur = 0.66, sfx: s = true } = {}) {
      tl.set(sel, { autoAlpha: 1 }, t);
      tl.fromTo(sel, { clipPath: `circle(0px at ${pt.x}px ${pt.y}px)` }, { clipPath: `circle(${Math.hypot(W, H)}px at ${pt.x}px ${pt.y}px)`, duration: dur, ease: "power2.inOut" }, t);
      if (s) sfx("swoosh", t, { dur: 0.3 });
      mark(sel, t + dur + 0.2);
    }
    /** Match cut: element flips (rotationY 180, needs .face.front/.face.back children) and grows into target rect `to`. */
    function flipTo(sel, r, to, t, { dur = 0.55, sfx: s = true } = {}) {
      tl.to(sel, { rotationY: 180, rotation: 0, scale: to.w / r.w, x: to.cx - r.cx, y: to.cy - r.cy, duration: dur, ease: "power3.inOut" }, t);
      if (s) sfx("flip", t);
    }
    /** Everything collapses into point `to` (great right before the logo). Pass rects measured up front. */
    function converge(items, to, t, { dur = 0.45, sfx: s = true } = {}) {
      items.forEach(({ el, r }, i) => tl.to(el, { x: to.x - r.cx, y: to.y - r.cy, scale: 0, autoAlpha: 0, duration: dur, ease: "power3.in" }, t + i * 0.02));
      if (s) sfx("whoosh", t, { dir: "down", dur });
    }
    /** Big payoff moment: flash + impact + optional crowd, and marks the music drop here. */
    function impact(t, { crowd = false, flashIt = false, sfx: s = true } = {}) {
      if (flashIt) flash(t);
      music.drop = t; mark("impact", t + 0.45);
      if (s) { sfx("riser", t - 0.5, { dur: 0.5 }); sfx("impact", t); if (crowd) sfx("cheer", t + 0.02, { dur: 2.3 }); }
    }
    /** Logo moment: brand hit sound + final chord of the soundtrack starts here. */
    function brandHit(t, { sfx: s = true } = {}) { music.end = t; mark("brand", t + 0.9); if (s) sfx("logo", t); }
    /** Final hold (≥1.5 s of readable logo + CTA). Keep only subtle idle motion after this point. */
    function end(t, dur = 1.6) { hold = t; if (music.end == null) music.end = t - 0.6; tl.to({}, { duration: dur }, t); }

    return {
      tl, $, $, W, H, rect, center, measure, show, hide, head, headOut, type, count, pop, rise, tilt, draw, idle, stamp, shake, flash, confetti,
      camFocus, breathe, camReset, cursor, circleFill, reveal, flipTo, converge, impact, brandHit, end, sfx,
      music: (m) => Object.assign(music, m), review: (name, t) => { review[name] = t; }, prng,
      _finish() {
        // manual M.review() names win; auto frames closer than 0.6 s to another frame are dropped
        const all = [...Object.entries(review).map(([n, t]) => [n, t, true]), ...autoReview.map(([n, t]) => [n, t, false])].sort((a, b) => a[1] - b[1]);
        const out = {};
        let lastT = -9, k = 0;
        for (const [n, t, manual] of all) { if (!manual && t - lastT < 0.6) continue; out[`${String(++k).padStart(2, "0")}-${n}`] = t; lastT = t; }
        return { cues, review: out, music, hold };
      },
    };
  }

  async function boot() {
    const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    await Promise.all(cfg.fonts.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => null) : null)));
    const stage = document.getElementById("stage"), cam = document.getElementById("camera");
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });
    gsap.set(".scene", { autoAlpha: 0 });
    gsap.set(cam, { x: 0, y: 0, scale: 1, transformOrigin: "0 0" });
    const snap = new Map([...stage.querySelectorAll("*")].map((el) => [el, el.getBoundingClientRect()]));
    const M = makeApi(tl, stage, cam, snap);
    if (!builder) throw new Error("Motion.build(fn) was not called");
    await builder(M);
    const meta = M._finish();
    const D = tl.duration();
    // continuous background drift over the whole video (parallax) — keeps even the final hold alive
    if (document.getElementById("bg")) tl.fromTo("#bg", { x: 0, y: 0 }, { x: -44, y: -176, duration: D, ease: "none" }, 0);
    if (document.getElementById("glow")) tl.fromTo("#glow", { x: 0, y: 0, scale: 1 }, { x: 180, y: -240, scale: 1.25, duration: D, ease: "sine.inOut" }, 0);
    window.SIZE = { w: cfg.size[0], h: cfg.size[1] };
    window.MOTION_FONTS = cfg.fonts;
    window.DURATION = tl.duration();
    window.HOLD_FROM = meta.hold ?? window.DURATION;
    window.REVIEW = meta.review;
    window.AUDIO = { seed: cfg.seed, music: { intro: 2, ...meta.music, end: meta.music.end ?? window.DURATION - 1.2 }, cues: meta.cues.sort((a, b) => a.t - b.t) };
    window.tl = tl;
    window.seek = (t) => { tl.seek(t, false); };
    tl.seek(0, false);
    return window.DURATION;
  }

  window.READY = new Promise((resolve, reject) => {
    const go = () => boot().then(resolve, reject);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  });
  window.Motion = { init, build, copy, lines, letters, prng };
})();
