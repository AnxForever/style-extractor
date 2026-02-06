#!/usr/bin/env node

/*
  Local demo runner for the replica workflow.

  Purpose:
  - Start the local static server (CORS-enabled)
  - Run the MCP replica runner against the included e2e page

  This avoids needing a Cloudflare tunnel during development because the target page is HTTP.

  Usage:
    node tools/run-local-demo.cjs --browserUrl http://127.0.0.1:9222 --outDir .tmp/replica-out
*/

const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findFreePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      srv.close(() => resolve(port));
    });
  });
}

function isOk(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const ok = (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 400;
      res.resume();
      resolve(ok);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function main() {
  const browserUrl = getArg("--browserUrl", null);
  const outDir = getArg("--outDir", path.join(".tmp", "replica-out"));
  const toolTimeoutMs = getArg("--toolTimeoutMs", null);
  const debug = hasFlag("--debug");

  const port = await findFreePort();
  if (!port) throw new Error("Failed to allocate a free port");

  const baseUrl = `http://127.0.0.1:${port}`;
  const url = `${baseUrl}/tests/e2e-test.html`;

  const serverProc = spawn(
    process.execPath,
    [path.join(__dirname, "cors-static-server.cjs"), "--port", String(port), "--root", path.join(__dirname, "..")],
    { stdio: debug ? "inherit" : "ignore", shell: false },
  );

  // Wait for server readiness (best-effort).
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await isOk(url);
    if (ok) break;
    // eslint-disable-next-line no-await-in-loop
    await sleep(150);
  }

  const runnerArgs = [
    path.join(__dirname, "run-replica-workflow.cjs"),
    "--url",
    url,
    "--baseUrl",
    baseUrl,
    "--outDir",
    outDir,
  ];
  if (browserUrl) runnerArgs.push("--browserUrl", browserUrl);
  if (toolTimeoutMs) runnerArgs.push("--toolTimeoutMs", toolTimeoutMs);
  if (debug) runnerArgs.push("--debug");

  const runnerProc = spawn(process.execPath, runnerArgs, { stdio: "inherit", shell: false });

  runnerProc.on("exit", (code) => {
    try {
      serverProc.kill();
    } catch {}
    process.exit(code ?? 1);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});

