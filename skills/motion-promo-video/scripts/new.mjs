#!/usr/bin/env node
// Scaffolds a self-contained video project: scene.html (working demo to edit), preview.html, assets/{motion.js,gsap.min.js,fonts.css}.
// Usage: node new.mjs <project-dir> [--format 9:16|16:9|1:1] [--fonts "Display:700,800" "Body:400,600"] [--no-fonts]
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(SKILL, "package.json"));
const argv = process.argv.slice(2);
const DIR = resolve(argv[0] ?? "promo-video");
const fmt = argv.includes("--format") ? argv[argv.indexOf("--format") + 1] : "9:16";
const SIZES = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };
if (!SIZES[fmt]) { console.error(`unknown format ${fmt} (use ${Object.keys(SIZES).join(", ")})`); process.exit(1); }
const [w, h] = SIZES[fmt];

try { await access(join(DIR, "scene.html")); console.error(`✗ ${DIR}/scene.html already exists — pick another folder or edit it directly.`); process.exit(1); } catch { /* ok, new project */ }
await mkdir(join(DIR, "assets"), { recursive: true });

let scene = await readFile(join(SKILL, "templates", "scene.html"), "utf8");
scene = scene.replace("--W: 1080px; --H: 1920px;", `--W: ${w}px; --H: ${h}px;`).replace("size: [1080, 1920],", `size: [${w}, ${h}],`)
  .replace('<html lang="pt-BR">', `<html lang="pt-BR" data-format="${fmt}">`);
if (fmt !== "9:16") scene = scene.replace("--head: 150px;", `--head: ${Math.round(Math.min(w, h) * 0.12)}px;`);
await writeFile(join(DIR, "scene.html"), scene);
await copyFile(join(SKILL, "templates", "preview.html"), join(DIR, "preview.html"));
await copyFile(join(SKILL, "runtime", "motion.js"), join(DIR, "assets", "motion.js"));
try { await copyFile(require.resolve("gsap/dist/gsap.min.js"), join(DIR, "assets", "gsap.min.js")); }
catch { console.error(`✗ gsap not installed. Run: cd "${SKILL}" && npm install`); process.exit(1); }
await writeFile(join(DIR, ".gitignore"), "out/\n.frames/\n");
await writeFile(join(DIR, "assets", "fonts.css"), "/* run fonts.mjs to fill this */\n");

if (!argv.includes("--no-fonts")) {
  const i = argv.indexOf("--fonts");
  const specs = i >= 0 ? argv.slice(i + 1).filter((a) => !a.startsWith("--")) : ["Bricolage Grotesque:700,800", "Figtree:400,600,700"];
  try { execFileSync(process.execPath, [join(SKILL, "scripts", "fonts.mjs"), DIR, ...specs], { stdio: "inherit" }); }
  catch { console.warn("⚠ font download failed — run fonts.mjs again (needs internet) or add local fonts to assets/fonts.css."); }
}

const S = join(SKILL, "scripts");
console.log(`
✓ project ready: ${DIR}  (${fmt}, ${w}x${h})
  edit      ${join(DIR, "scene.html")}   ← tokens (section 1), markup, COPY (section 4), timeline (section 5)
  preview   node "${S}/preview.mjs" "${DIR}"
  draft     node "${S}/render.mjs" "${DIR}" --draft      → out/contact.draft.png (look at it!)
  final     node "${S}/render.mjs" "${DIR}"              → out/${DIR.split(/[\\/]/).pop()}.mp4`);
