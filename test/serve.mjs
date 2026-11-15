import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mounts = [
  { prefix: "/teacher-tools", directory: path.join(root, "dist") },
  { prefix: "/go", directory: path.resolve(root, "..", "go", "dist") },
];
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function inside(rootDirectory, candidate) {
  const rootPath = path.resolve(rootDirectory);
  const resolved = path.resolve(candidate);
  return resolved === rootPath || resolved.startsWith(`${rootPath}${path.sep}`);
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:4173");
  const mount = mounts.find((entry) => url.pathname === entry.prefix || url.pathname.startsWith(`${entry.prefix}/`));
  if (!mount) {
    response.writeHead(404).end("Not found");
    return;
  }
  let relative = decodeURIComponent(url.pathname.slice(mount.prefix.length)).replace(/^\/+/, "");
  let file = path.join(mount.directory, relative);
  if (!inside(mount.directory, file)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
    const body = await fs.readFile(file);
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch {
    const fallback = path.join(mount.directory, "404.html");
    try {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await fs.readFile(fallback));
    } catch {
      response.writeHead(404).end("Not found");
    }
  }
}).listen(4173, "127.0.0.1", () => console.log("Teacher Tools test server listening on 4173"));

