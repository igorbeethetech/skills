// Locates an FFmpeg build with libx264 and runs it. Order: $FFMPEG → PATH → common install folders (winget, Homebrew, choco).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const INSTALL_HINT = {
  win32: "winget install --id Gyan.FFmpeg -e   (then open a new terminal)",
  darwin: "brew install ffmpeg",
  linux: "sudo apt install ffmpeg   (or your distro's package manager)",
}[process.platform] ?? "https://ffmpeg.org/download.html";

export function findFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/)[0].trim();
    if (out) return out;
  } catch { /* not on PATH */ }
  const candidates = [];
  const pkgs = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  if (pkgs && existsSync(pkgs)) for (const d of readdirSync(pkgs).filter((x) => /ffmpeg/i.test(x))) for (const sub of readdirSync(join(pkgs, d))) candidates.push(join(pkgs, d, sub, "bin", "ffmpeg.exe"));
  candidates.push("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg");
  return candidates.find((c) => existsSync(c)) ?? null;
}

let cached;
export function ffmpegPath() {
  cached ??= findFfmpeg();
  if (!cached) throw new Error(`FFmpeg not found. Install it with: ${INSTALL_HINT} — or set FFMPEG=/path/to/ffmpeg`);
  return cached;
}
export const ffprobePath = () => ffmpegPath().replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext ?? ""}`);

/** Runs ffmpeg; resolves on exit code 0. */
export function ffmpeg(args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", quiet ? "error" : "info", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
}

export function probe(file) {
  return JSON.parse(execFileSync(ffprobePath(), ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" }));
}

/** Integrated loudness (LUFS) and true peak (dBFS) of a file's audio. */
export function loudness(file) {
  const out = spawnSync(ffmpegPath(), ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(out.split("Summary:").pop() ?? ""), P = /Peak:\s+(-?[\d.]+) dBFS/.exec(out.split("Summary:").pop() ?? "");
  return { lufs: I ? Number(I[1]) : null, peak: P ? Number(P[1]) : null };
}
