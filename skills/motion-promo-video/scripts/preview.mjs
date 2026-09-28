#!/usr/bin/env node
// Serves a project so preview.html (scrubber) and scene.html load fonts over http. Ctrl+C to stop.
// Usage: node preview.mjs <project-dir> [--port 5178]
import { resolve } from "node:path";
import { serve } from "./lib/server.mjs";

const argv = process.argv.slice(2);
const port = argv.includes("--port") ? Number(argv[argv.indexOf("--port") + 1]) : 5178;
const { url } = await serve(resolve(argv[0] ?? "."), port);
console.log(`preview: ${url}/preview.html   (scene only: ${url}/scene.html?lang=en)`);
