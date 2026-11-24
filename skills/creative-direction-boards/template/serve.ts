// Serve the working folder with caching off, compiling .ts to JavaScript on the fly.
// No build step and no dependencies: Node 22.18+ strips the types itself.
//
//   node serve.ts [port]        then open http://localhost:5191/collage.html or /rooms/

import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Result, ok, err } from "./src/result.ts";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

function parsePort(arg: string | undefined): Result<number> {
  if (arg === undefined) return ok(5191);
  const n = Number(arg);
  return Number.isInteger(n) && n > 0 && n < 65536 ? ok(n) : err(`not a port: ${arg}`);
}

/** Map a URL path to a file inside ROOT, refusing anything that escapes it. */
async function resolvePath(urlPath: string): Promise<Result<string>> {
  const rel = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/"));
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return err("outside the folder");
  try {
    const s = await stat(full);
    return ok(s.isDirectory() ? join(full, "index.html") : full);
  } catch {
    return err("not found");
  }
}

async function body(path: string): Promise<Result<Buffer | string>> {
  try {
    const buf = await readFile(path);
    if (extname(path) !== ".ts") return ok(buf);
    return ok(stripTypeScriptTypes(buf.toString("utf8"), { mode: "strip" }));
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

function send(res: ServerResponse, status: number, type: string, data: Buffer | string): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(data);
}

const port = parsePort(process.argv[2]);
if (!port.ok) {
  console.error(port.error);
  process.exit(2);
}

createServer((req, res) => {
  void (async () => {
    const path = await resolvePath(req.url ?? "/");
    if (!path.ok) return send(res, 404, "text/plain", path.error);
    const data = await body(path.value);
    if (!data.ok) return send(res, 500, "text/plain", data.error);
    send(res, 200, TYPES[extname(path.value)] ?? "application/octet-stream", data.value);
  })();
}).listen(port.value, "127.0.0.1", () => {
  console.log(`Mockups: http://localhost:${port.value}/collage.html`);
  console.log(`Rooms:   http://localhost:${port.value}/rooms/`);
});
