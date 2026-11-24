// Tiny static server for the exported site (out/). No dependencies.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../out/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, p);
  const isFile = async (f) => { try { return (await stat(f)).isFile(); } catch { return false; } };
  let file = base;
  for (const c of [base, base + ".html", join(base, "index.html")]) {
    if (await isFile(c)) { file = c; break; }
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(4173);
