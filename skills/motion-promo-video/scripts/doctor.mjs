#!/usr/bin/env node
// Checks every dependency and prints the exact command to fix what is missing. Never installs anything by itself.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { findFfmpeg, INSTALL_HINT } from "./lib/ffmpeg.mjs";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(SKILL, "package.json"));
const rows = [];
const ok = (name, detail) => rows.push(["✓", name, detail]);
const fail = (name, fix) => rows.push(["✗", name, fix]);

const major = Number(process.versions.node.split(".")[0]);
major >= 18 ? ok("Node.js", process.versions.node) : fail("Node.js ≥ 18", "install from https://nodejs.org");

let pw = null;
try { pw = require("playwright"); ok("playwright (npm)", require("playwright/package.json").version); }
catch { fail("playwright (npm)", `cd "${SKILL}" && npm install`); }
try { require.resolve("gsap/dist/gsap.min.js"); ok("gsap (npm)", require("gsap/package.json").version); }
catch { fail("gsap (npm)", `cd "${SKILL}" && npm install`); }

if (pw) {
  const exe = pw.chromium.executablePath();
  existsSync(exe) ? ok("Chromium for Playwright", exe) : fail("Chromium for Playwright", `cd "${SKILL}" && npx playwright install chromium`);
}
const ff = findFfmpeg();
ff ? ok("FFmpeg", ff) : fail("FFmpeg (with libx264)", INSTALL_HINT);

for (const [s, n, d] of rows) console.log(`${s} ${n.padEnd(26)} ${d}`);
const missing = rows.filter((r) => r[0] === "✗").length;
console.log(missing ? `\n${missing} missing — run the command(s) above (ask the user before installing system software).` : "\nAll set.");
process.exit(missing ? 1 : 0);
