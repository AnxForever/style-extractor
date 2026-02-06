#!/usr/bin/env node

/*
  Static file server with permissive CORS headers.

  Why: When injecting scripts into an HTTPS site (e.g. stylekit.top) from localhost,
  browsers will block mixed-content HTTP loads. Pair this with a Cloudflare quick tunnel
  (cloudflared) to get an HTTPS origin that still serves local files.

  Usage:
    node tools/cors-static-server.cjs --port 8787
*/

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

const port = Number(getArg("--port", "8787"));
const root = path.resolve(getArg("--root", path.join(__dirname, "..")));

const MIME = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".cjs", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".py", "text/plain; charset=utf-8"],
]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
}

function safeResolve(requestPath) {
  const pathname = requestPath.split("?")[0] || "/";
  const decoded = decodeURIComponent(pathname);

  // Force absolute-from-root semantics and prevent traversal.
  const rel = decoded.startsWith("/") ? decoded.slice(1) : decoded;
  const full = path.resolve(root, rel);
  const within = path.relative(root, full) && !path.relative(root, full).startsWith("..");
  if (!within) return null;
  return full;
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const filePath = safeResolve(req.url);
  if (!filePath) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, "index.html");
    try {
      stat = fs.statSync(indexPath);
      if (!stat.isFile()) throw new Error("not file");
      return serveFile(indexPath, req, res);
    } catch {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
  }

  if (!stat.isFile()) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  serveFile(filePath, req, res);
});

function serveFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME.get(ext) || "application/octet-stream");

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    res.statusCode = 500;
    res.end("Internal Server Error");
  });
  stream.pipe(res);
}

server.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[cors-static-server] http://127.0.0.1:${port} (root=${root})`);
});

