// Minimal static server (fonts loaded over file:// hit CORS, so scenes are always served over http).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg",
};

export async function serve(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = resolve(join(base, path === "/" ? "preview.html" : path));
      if (!file.startsWith(base)) throw new Error("outside root");
      const body = await readFile(file); // read before writeHead so a 404 never sends headers twice
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
