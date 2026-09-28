#!/usr/bin/env node
// Cuts pieces out of a screenshot/print so they can float as cards (<img class="shot">) in the scene.
// Usage:
//   node crop.mjs <image> --info                                  → prints width x height
//   node crop.mjs <image> <x>,<y>,<w>,<h> <out.png> [--scale 2] [--knockout-white]
//        → crop in NATIVE pixels of the image (the Read tool may show it downscaled — use --grid/--info, not the preview)
//        --knockout-white: white → transparent with soft edges (logos/icons on white; mix-blend-mode won't work in the scene)
//   node crop.mjs <image> --grid <out.png>                          → same image with a 100px labelled grid, to read coordinates
import { resolve } from "node:path";
import { ffmpeg, probe } from "./lib/ffmpeg.mjs";

const argv = process.argv.slice(2);
const img = resolve(argv[0] ?? "");
const s = probe(img).streams.find((x) => x.width);
if (argv.includes("--info")) { console.log(`${s.width}x${s.height}`); process.exit(0); }
if (argv.includes("--grid")) {
  const out = resolve(argv[argv.indexOf("--grid") + 1]);
  const step = 100;
  await ffmpeg(["-y", "-i", img, "-vf", `drawgrid=w=${step}:h=${step}:t=1:c=red@0.55,drawgrid=w=${step * 5}:h=${step * 5}:t=3:c=red@0.9`, out]);
  console.log(`✓ ${out} — thin lines every ${step}px, thick every ${step * 5}px (origin top-left)`);
  process.exit(0);
}
const [x, y, w, h] = (argv[1] ?? "").split(",").map(Number);
if ([x, y, w, h].some((v) => !Number.isFinite(v))) { console.error("usage: crop.mjs <image> x,y,w,h <out.png> [--scale 2]"); process.exit(1); }
const out = resolve(argv[2] ?? "crop.png");
const scale = argv.includes("--scale") ? Number(argv[argv.indexOf("--scale") + 1]) : 1;
const vf = [`crop=${Math.min(w, s.width - x)}:${Math.min(h, s.height - y)}:${x}:${y}`];
if (scale !== 1) vf.push(`scale=iw*${scale}:ih*${scale}:flags=lanczos`);
if (argv.includes("--knockout-white")) {
  // un-premultiply from white: alpha = 255 - min(r,g,b); color = 255 - (255 - c) * 255 / alpha
  const A = "(255-min(min(r(X,Y),g(X,Y)),b(X,Y)))";
  const ch = (k) => `if(lt(${A},6),0,clip(255-(255-${k}(X,Y))*255/${A},0,255))`;
  vf.push("format=rgba", `geq=r='${ch("r")}':g='${ch("g")}':b='${ch("b")}':a='if(lt(${A},6),0,${A})'`);
}
await ffmpeg(["-y", "-i", img, "-vf", vf.join(","), out]);
console.log(`✓ ${out} (${Math.round(w * scale)}x${Math.round(h * scale)})`);
