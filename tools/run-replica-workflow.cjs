#!/usr/bin/env node

/*
  Replica workflow runner (MCP client) for chrome-devtools-mcp.

  What it does:
  1) Starts chrome-devtools-mcp (server) and connects as a minimal MCP client.
  2) Opens a URL in the connected Chrome instance.
  3) Injects style-extractor scripts from a base URL (typically a local Cloudflare tunnel).
  4) Runs extractStyle({ preset: 'replica' }) to obtain the blueprint batch steps.
  5) Executes blueprint.interaction.workflowsForTopTargets.batch.serialized.steps in order.

  Usage:
    node tools/run-replica-workflow.cjs --url https://www.stylekit.top/ --baseUrl https://YOUR-TUNNEL.trycloudflare.com

  Notes:
  - This runner is intentionally dependency-free (no MCP SDK) and speaks newline-delimited JSON-RPC over stdio
    (the transport used by chrome-devtools-mcp).
  - It tries to auto-resolve <element_uid> for hover/click steps using the latest a11y snapshot.
*/

const fs = require("node:fs");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

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

function waitForExit(proc, ms) {
  if (!proc) return Promise.resolve(true);
  if (proc.exitCode !== null && proc.exitCode !== undefined) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, ms);

    proc.once("exit", () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(true);
    });
  });
}

async function killProcessTree(proc, timeoutMs = 1200) {
  if (!proc) return;

  try {
    proc.kill();
  } catch {}

  if (await waitForExit(proc, timeoutMs)) return;

  // Windows + shell mode can leave grandchildren running (cmd.exe -> npx -> node).
  // taskkill /T is the most reliable way to cleanly end the tree.
  if (process.platform === "win32" && proc.pid) {
    try {
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore", shell: false });
    } catch {}
  } else {
    try {
      proc.kill("SIGKILL");
    } catch {}
  }

  await waitForExit(proc, timeoutMs);
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function getWslHostIp() {
  if (!process.env.WSL_DISTRO_NAME) return null;
  try {
    const resolvConf = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = resolvConf.match(/^nameserver\s+([0-9.]+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function buildBrowserUrlCandidates() {
  const candidates = [];
  if (process.env.CHROME_BROWSER_URL) candidates.push(process.env.CHROME_BROWSER_URL);
  const wslHostIp = getWslHostIp();
  if (wslHostIp) candidates.push(`http://${wslHostIp}:9222`);
  candidates.push("http://127.0.0.1:9222");
  return [...new Set(candidates)];
}

function isReachable(browserUrl, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL("/json/version", browserUrl);
    } catch {
      resolve(false);
      return;
    }

    const request = http.get(
      url,
      { timeout: timeoutMs, headers: { Accept: "application/json" } },
      (response) => {
        const status = response.statusCode ?? 500;
        const ok = status >= 200 && status < 400;
        response.resume();
        resolve(ok);
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function pickBrowserUrl() {
  const candidates = buildBrowserUrlCandidates();
  for (const candidate of candidates) {
    if (await isReachable(candidate)) return candidate;
  }
  return candidates[0];
}

function encodeFrame(obj) {
  // chrome-devtools-mcp uses newline-delimited JSON-RPC over stdio (not LSP-style Content-Length framing).
  return Buffer.from(`${JSON.stringify(obj)}\n`, "utf8");
}

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    proc.stdout.on("data", (chunk) => this._onData(chunk));
    proc.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`MCP server exited (code=${code ?? "unknown"})`));
      }
      this.pending.clear();
    });
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Parse one or more newline-delimited JSON-RPC messages.
    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) return;
      let line = this.buffer.slice(0, lineEnd).toString("utf8");
      this.buffer = this.buffer.slice(lineEnd + 1);

      line = line.replace(/\r$/, "");
      if (!line.trim()) continue;

      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      this._onMessage(msg);
    }
  }

  _onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    const id = msg.id;
    if (id === undefined || id === null) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (msg.error) pending.reject(new Error(msg.error.message || "MCP error"));
    else pending.resolve(msg.result);
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const frame = encodeFrame(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(frame);
    });
  }

  notify(method, params) {
    const payload = { jsonrpc: "2.0", method, params };
    const frame = encodeFrame(payload);
    this.proc.stdin.write(frame);
  }
}

function stripToolPrefix(toolName) {
  const s = String(toolName || "");
  return s.startsWith("mcp__chrome-devtools__") ? s.slice("mcp__chrome-devtools__".length) : s;
}

function flattenToolResult(result) {
  // MCP tool calls return: { content: [{ type, text, ... }], isError? }
  // We prefer the first text content.
  if (!result) return null;
  const content = result.content;
  if (Array.isArray(content)) {
    const text = content.find((c) => c && c.type === "text" && typeof c.text === "string")?.text;
    return text ?? result;
  }
  return result;
}

function normalizeSnapshotText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseSnapshotText(text) {
  const lines = String(text || "").split("\n");
  const nodes = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("uid=")) continue;
    // Example:
    // uid=6_30 link "BRUTAL 大胆直接的设计 ACTION" url="https://..."
    const uidMatch = trimmed.match(/^uid=([^\s]+)\s+([^\s]+)(?:\s+\"([^\"]*)\")?/);
    if (!uidMatch) continue;
    const uid = uidMatch[1];
    const role = uidMatch[2];
    const name = uidMatch[3] || "";
    const urlMatch = trimmed.match(/\burl=\"([^\"]+)\"/);
    const url = urlMatch ? urlMatch[1] : null;
    nodes.push({ uid, role, name, url, raw: trimmed });
  }

  return nodes;
}

function parseJsonFromToolText(text) {
  if (text == null) return null;
  const raw = String(text);
  const trimmed = raw.trim();

  // Best case: tool returned raw JSON.
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  // Common case: tool wraps JSON in a ```json code fence.
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }

  // Fallback: try to parse the first {...} block found.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }

  return null;
}

function scoreSnapshotNode(node, hint) {
  let score = 0;
  if (!node || !hint) return score;

  const nodeRole = String(node.role || "").toLowerCase();
  const nodeName = normalizeSnapshotText(node.name || "");
  const nodeUrl = String(node.url || "");

  const hintRole = String(hint.role || "").toLowerCase();
  const hintName = normalizeSnapshotText(hint.name || "");
  const hintUrl = String(hint.url || "");

  if (hintRole && nodeRole === hintRole) score += 60;
  if (hintUrl && nodeUrl && nodeUrl === hintUrl) score += 120;

  if (hintName) {
    if (nodeName === hintName) score += 80;
    if (nodeName.includes(hintName)) score += 50;
    // Token overlap
    const tokens = hintName.split(" ").filter(Boolean).slice(0, 6);
    const overlap = tokens.reduce((n, t) => (nodeName.includes(t) ? n + 1 : n), 0);
    score += overlap * 8;
  }

  // Prefer interactive roles when we are resolving hover/click
  if (["link", "button"].includes(nodeRole)) score += 5;

  return score;
}

async function main() {
  const url = getArg("--url");
  const baseUrl = getArg("--baseUrl");
  const viewport = getArg("--viewport", null);
  const maxSteps = Number(getArg("--maxSteps", "0")) || 0;
  const toolTimeoutMs = Number(getArg("--toolTimeoutMs", "60000")) || 60000;
  const testInit = hasFlag("--testInit") || hasFlag("--smoke");
  const browserUrlOverride = getArg("--browserUrl", null);
  const outDir = getArg("--outDir", null);
  const codeMaxNodes = Number(getArg("--codeMaxNodes", "240")) || 240;
  const codeMaxDepth = Number(getArg("--codeMaxDepth", "12")) || 12;
  const promptMaxChars = Number(getArg("--promptMaxChars", "12000")) || 12000;
  const skipResponsive = hasFlag("--skipResponsive");
  const withScreenshots = hasFlag("--withScreenshots");
  const skipScreenshots = hasFlag("--skipScreenshots") || !withScreenshots;
  const strict = hasFlag("--strict");

  if (testInit) {
    // Allow smoke-testing MCP transport without needing Chrome or script injection.
  } else if (!url || !baseUrl) {
    // eslint-disable-next-line no-console
    console.error("Usage: node tools/run-replica-workflow.cjs --url <https://site> --baseUrl <https://tunnel>");
    console.error("  or:   node tools/run-replica-workflow.cjs --testInit");
    process.exit(1);
  }

  const browserUrl = browserUrlOverride || (await pickBrowserUrl());
  const serverArgs = ["chrome-devtools-mcp@latest", "--browserUrl", browserUrl, "--no-usage-statistics"];
  if (viewport) serverArgs.push("--viewport", viewport);

  // Start MCP server (chrome-devtools-mcp)
  // NOTE: On Windows, spawning `npx.cmd` via `shell: true` can cause an intermediate `cmd.exe` to exit
  // while leaving `chrome-devtools-mcp` running with inherited stdio handles. That keeps this runner alive
  // even after it finishes. Prefer running `npx-cli.js` directly via Node when available.
  const npxCliPath =
    process.platform === "win32"
      ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js")
      : null;

  const serverProc =
    npxCliPath && fs.existsSync(npxCliPath)
      ? spawn(process.execPath, [npxCliPath, ...serverArgs], { stdio: ["pipe", "pipe", "pipe"], shell: false })
      : spawn(process.platform === "win32" ? "npx.cmd" : "npx", serverArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          shell: process.platform === "win32",
        });

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await killProcessTree(serverProc);
  };

  const handleSignal = (code) => {
    cleanup().finally(() => process.exit(code));
  };
  process.once("SIGINT", () => handleSignal(130));
  process.once("SIGTERM", () => handleSignal(143));

  serverProc.stderr.setEncoding("utf8");
  serverProc.stderr.on("data", (chunk) => {
    if (hasFlag("--debug")) process.stderr.write(chunk);
  });

  const mcp = new McpClient(serverProc);

  let succeeded = false;
  try {
    // Initialize
    await withTimeout(
      mcp.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "style-extractor-replica-runner", version: "0.1.0" },
      }),
      toolTimeoutMs,
      "initialize",
    );
    mcp.notify("notifications/initialized", {});

    // Discover tool names
    const list = await withTimeout(mcp.request("tools/list", {}), toolTimeoutMs, "tools/list");
    const toolNames = new Set((list?.tools || []).map((t) => t.name));

    if (testInit) {
      // eslint-disable-next-line no-console
      console.log(`ok: initialize + tools/list (${toolNames.size} tools)`);
      succeeded = true;
      return;
    }

    const callTool = async (name, params) => {
      const normalized = toolNames.has(name) ? name : stripToolPrefix(name);
      if (!toolNames.has(normalized)) {
        throw new Error(`Tool not found: ${name} (normalized=${normalized})`);
      }
      const result = await withTimeout(
        mcp.request("tools/call", { name: normalized, arguments: params || {} }),
        toolTimeoutMs,
        `tools/call ${normalized}`,
      );
      if (result?.isError) {
        const message = flattenToolResult(result);
        throw new Error(`Tool failed: ${normalized}\n${String(message || "").trim()}`);
      }
      return result;
    };

    // Open page
    const page = await callTool("mcp__chrome-devtools__new_page", { url });
    const pageText = flattenToolResult(page);
    if (hasFlag("--debug")) {
      process.stderr.write(String(pageText || "") + "\n");
    }

    // Inject scripts (from tunnel)
    const inject = await callTool("mcp__chrome-devtools__evaluate_script", {
      function: `async () => {
      const base = ${JSON.stringify(baseUrl)};
      const entries = [
        { file: 'scripts/utils.js', globals: ['__seUtils'] },
        { file: 'scripts/structure-extract.js', globals: ['__seStructure'] },
        { file: 'scripts/css-parser.js', globals: ['__seCSS'] },
        { file: 'scripts/component-detect.js', globals: ['__seComponents'] },
        { file: 'scripts/state-capture.js', globals: ['__seStateCapture'] },
        { file: 'scripts/ai-semantic.js', globals: ['__seAISemantic'] },
        { file: 'scripts/a11y-tree.js', globals: ['__seA11y'] },
        { file: 'scripts/responsive-extract.js', globals: ['__seResponsive'] },
        { file: 'scripts/stylekit-adapter.js', globals: ['__seStyleKit'] },
        { file: 'scripts/theme-detect.js', globals: ['__seTheme'] },
        { file: 'scripts/motion-tools.js', globals: ['__seMotion'] },
        { file: 'scripts/motion-enhanced.js', globals: ['__seMotionEnhanced'] },
        { file: 'scripts/motion-assoc.js', globals: ['__seMotionAssoc'] },
        { file: 'scripts/screenshot-helper.js', globals: ['__seScreenshot'] },
        { file: 'scripts/library-detect.js', globals: ['__seLibs'] },
        { file: 'scripts/code-generator.js', globals: ['__seCodeGen'] },
        { file: 'scripts/replica-blueprint.js', globals: ['__seBlueprint'] },
        { file: 'scripts/format-converter.js', globals: ['__seFormat'] },
        { file: 'scripts/export-schema.js', globals: ['__seExport'] },
        { file: 'scripts/incremental.js', globals: ['__seIncremental'] },
        { file: 'scripts/multi-page.js', globals: ['__seMultiPage'] },
        { file: 'scripts/registry.js', globals: ['__seRegistry', 'extractStyle'] }
      ];

      for (const entry of entries) {
        for (const g of entry.globals) {
          try { window[g] = null; } catch {}
        }
      }
      try { window.extractStyle = null; } catch {}

      const loaded = [];
      for (const entry of entries) {
        const url = base + '/' + entry.file + '?t=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Fetch failed: ' + url + ' HTTP ' + res.status);
        const code = await res.text();
        (0, eval)(code + '\\n//# sourceURL=' + url);
        loaded.push(entry.file);
      }

      return {
        ok: typeof window.extractStyle === 'function',
        loadedCount: loaded.length,
        loaded
      };
    }`,
    });
    const injectText = flattenToolResult(inject);
    if (hasFlag("--debug")) process.stderr.write(String(injectText || "") + "\n");

    // Get interaction batch steps only (avoid returning huge objects)
    const stepsRes = await callTool("mcp__chrome-devtools__evaluate_script", {
      function: `async () => {
      const r = await window.extractStyle({ preset: 'replica', format: 'json' });
      const steps = r?.data?.blueprint?.interaction?.workflowsForTopTargets?.batch?.serialized?.steps || [];
      return { ok: true, stepCount: steps.length, steps };
    }`,
    });
    const stepsText = flattenToolResult(stepsRes);
    const parsed = parseJsonFromToolText(stepsText);
    if (!parsed) throw new Error("Failed to parse steps JSON from evaluate_script");
    const interactionSteps = Array.isArray(parsed?.steps) ? parsed.steps : [];
    if (!interactionSteps.length) {
      // eslint-disable-next-line no-console
      console.error("No steps found in blueprint interaction batch.");
      process.exit(1);
    }

    function serializeViewportWorkflow(workflow) {
      if (!workflow || typeof workflow !== "object") return [];
      const wfSteps = Array.isArray(workflow.steps) ? workflow.steps : [];
      const out = [];
      for (const s of wfSteps) {
        if (s?.mcpTool?.name) {
          out.push({
            step: s.step ?? null,
            tool: s.mcpTool.name,
            params: s.mcpTool.params || {},
            action: s.action || null,
            selector: null,
          });
        }
        if (s?.script) {
          out.push({
            step: s.step ?? null,
            tool: "mcp__chrome-devtools__evaluate_script",
            params: { function: s.script },
            action: s.action || null,
            selector: null,
          });
        }
      }
      return out;
    }

    let lastSnapshotNodes = null;

    const runSteps = async (steps, stageLabel) => {
      // eslint-disable-next-line no-console
      console.log(`[stage] ${stageLabel}: ${steps.length} steps`);

      for (let idx = 0; idx < steps.length; idx += 1) {
        if (maxSteps && idx >= maxSteps) break;
        const step = steps[idx];
        const stepNo = step.step ?? "?";
        let tool = step.tool;
        let params = step.params || {};
        const shortTool = stripToolPrefix(tool);

        // eslint-disable-next-line no-console
        console.log(`[${stageLabel} ${stepNo}] ${tool} ${step.action || ""}`.trim());

        if (skipScreenshots && shortTool === "take_screenshot") {
          // eslint-disable-next-line no-console
          console.log("  skipped screenshot");
          continue;
        }

        // Normalize common mismatch: emulate viewport object -> resize_page
        if (shortTool === "emulate" && params && typeof params === "object") {
          const vp = params.viewport;
          if (vp && typeof vp === "object") {
            const w = Number(vp.width);
            const h = Number(vp.height);
            if (Number.isFinite(w) && Number.isFinite(h)) {
              tool = "mcp__chrome-devtools__resize_page";
              params = { width: w, height: h };
            }
          }
        }

        // Resolve UID placeholder for hover/click.
        if (params && typeof params === "object" && typeof params.uid === "string" && params.uid.includes("<element_uid>")) {
          if (!lastSnapshotNodes || lastSnapshotNodes.length === 0) {
            // Take a snapshot now (best effort)
            const snap = await callTool("mcp__chrome-devtools__take_snapshot", {});
            lastSnapshotNodes = parseSnapshotText(flattenToolResult(snap));
          }

          const selector = step.selector || null;
          const hintRes = selector
            ? await callTool("mcp__chrome-devtools__evaluate_script", {
                function: `() => {
                  const sel = ${JSON.stringify(selector)};
                  const el = document.querySelector(sel);
                  if (!el) return { ok: false, selector: sel };
                  const tag = el.tagName.toLowerCase();
                  const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag);
                  const name = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
                  const url = tag === 'a' ? (el.href || null) : null;
                  return { ok: true, selector: sel, role, name, url };
                }`,
              })
            : null;

          const hintText = hintRes ? flattenToolResult(hintRes) : null;
          const hint = parseJsonFromToolText(hintText);

          if (!hint?.ok) {
            throw new Error(`Cannot resolve UID: failed to compute hint for selector (step=${stepNo})`);
          }

          let best = null;
          for (const node of lastSnapshotNodes) {
            const score = scoreSnapshotNode(node, hint);
            if (!best || score > best.score) best = { node, score };
          }

          if (!best || best.score < 40) {
            throw new Error(
              `Cannot resolve UID for step=${stepNo}. Hint role=${hint.role} name=${hint.name}. Take a snapshot and pick UID manually.`,
            );
          }

          params.uid = best.node.uid;
          // eslint-disable-next-line no-console
          console.log(`  resolved uid=${params.uid} (role=${best.node.role} name="${best.node.name}")`);
        }

        let res;
        try {
          res = await callTool(tool, params);
        } catch (err) {
          // Screenshots are optional; keep going even if flaky.
          if (shortTool === "take_screenshot") {
            // eslint-disable-next-line no-console
            console.error(`  screenshot failed (continuing): ${String(err?.message || err)}`);
            continue;
          }
          // Hover/click can be flaky on busy pages or when elements are off-screen/covered.
          // Default to tolerant behavior so the workflow can still complete and emit outputs.
          if (!strict && (shortTool === "hover" || shortTool === "click")) {
            // eslint-disable-next-line no-console
            console.error(`  ${shortTool} failed (continuing): ${String(err?.message || err)}`);
            continue;
          }
          throw err;
        }
        const text = flattenToolResult(res);

        // Track latest snapshot for future UID resolution.
        if (stripToolPrefix(tool) === "take_snapshot") {
          lastSnapshotNodes = parseSnapshotText(text);
        }

        // Special-case restore: if the script returned {width,height}, resize back.
        if (shortTool === "evaluate_script" && step.action === "restore") {
          const payload = parseJsonFromToolText(text);
          const w = Number(payload?.width);
          const h = Number(payload?.height);
          if (Number.isFinite(w) && Number.isFinite(h)) {
            try {
              await callTool("mcp__chrome-devtools__resize_page", { width: w, height: h });
            } catch {}
          }
        }

        if (hasFlag("--debug")) {
          process.stderr.write(String(text || "") + "\n");
        }

        // Small pacing to reduce flakiness on heavy pages.
        await sleep(80);
      }
    };

    await runSteps(interactionSteps, "interaction");

    if (!skipResponsive) {
      const responsiveRes = await callTool("mcp__chrome-devtools__evaluate_script", {
        function: `async () => {
          const r = await window.extractStyle({ preset: 'replica', format: 'json' });
          const wf = r?.data?.blueprint?.responsive?.viewportWorkflow || null;
          const steps = wf?.serialized?.steps || null;
          return { ok: true, hasSerialized: Array.isArray(steps), stepCount: Array.isArray(steps) ? steps.length : 0, steps, workflow: wf };
        }`,
      });

      const responsivePayload = parseJsonFromToolText(flattenToolResult(responsiveRes));
      const responsiveSteps = Array.isArray(responsivePayload?.steps)
        ? responsivePayload.steps
        : serializeViewportWorkflow(responsivePayload?.workflow);

      if (responsiveSteps.length > 0) {
        await runSteps(responsiveSteps, "responsive");
      } else {
        // eslint-disable-next-line no-console
        console.log("[stage] responsive: no steps (skipped)");
      }
    }

    // Re-run extraction for a compact verification summary.
    const verify = await callTool("mcp__chrome-devtools__evaluate_script", {
      function: `async () => {
        const r = await window.extractStyle({ preset: 'replica', format: 'json' });
        const stateData = r?.data?.['state-capture'] || null;
        const capturedCount = stateData?.captured?.states ? Object.keys(stateData.captured.states).length : 0;
        const blueprintTargets = r?.data?.blueprint?.interaction?.targets?.length || 0;
        const recCount = r?.data?.blueprint?.interaction?.recommendations?.total || 0;
        const responsiveLayouts = r?.data?.blueprint?.responsive?.variants?.layouts || null;
        const responsiveCount = responsiveLayouts ? Object.keys(responsiveLayouts).length : 0;
        return { ok: true, capturedCount, responsiveCount, blueprintTargets, recCount };\n      }`,
    });
    // eslint-disable-next-line no-console
    console.log("verify:", parseJsonFromToolText(flattenToolResult(verify)) || flattenToolResult(verify));

    if (outDir) {
      const out = await callTool("mcp__chrome-devtools__evaluate_script", {
        function: `async () => {
         const r = await window.extractStyle({ preset: 'replica', format: 'raw' });
         const bp = r?.data?.blueprint || null;
         const sc = r?.data?.['state-capture'] || null;
         const files = window.__seCodeGen?.toReplicaReact
           ? window.__seCodeGen.toReplicaReact(bp, sc, { maxNodes: ${codeMaxNodes}, maxDepth: ${codeMaxDepth}, stateLimit: 12 })
           : null;
         const prompt = window.__seBlueprint?.toLLMPrompt
           ? window.__seBlueprint.toLLMPrompt(bp, { maxChars: ${promptMaxChars} })
           : null;
         const responsiveSummary = (() => {
           const stored = window.__seResponsive?.getAllStoredLayouts ? window.__seResponsive.getAllStoredLayouts() : null;
           if (!stored || typeof stored !== 'object') return null;

           const pickContainers = (layout) => {
             const list = Array.isArray(layout?.layoutContainers) ? layout.layoutContainers : [];
             const candidates = list
               .filter((c) => c && typeof c === 'object' && c.selector && c.rect)
               .map((c) => ({
                 selector: c.selector || null,
                 rect: c.rect || null,
                 padding: c?.sizing?.padding || null,
                 margin: c?.sizing?.margin || null,
                 maxWidth: c?.sizing?.maxWidth || null
               }));
             candidates.sort((a, b) => {
               const aw = Number(a?.rect?.width) || 0;
               const ah = Number(a?.rect?.height) || 0;
               const bw = Number(b?.rect?.width) || 0;
               const bh = Number(b?.rect?.height) || 0;
               return (bw * bh) - (aw * ah);
             });
             return candidates.slice(0, 40);
           };

           const out = {};
           for (const [name, layout] of Object.entries(stored)) {
             if (!layout || typeof layout !== 'object') continue;
             out[name] = {
               viewport: layout.viewport || null,
               breakpoint: layout.breakpoint || null,
               containerCount: Array.isArray(layout.layoutContainers) ? layout.layoutContainers.length : 0,
               containers: pickContainers(layout)
             };
           }
           return out;
         })();
         return {
           ok: true,
           hasBlueprint: !!bp,
           fileKeys: files?.files ? Object.keys(files.files) : [],
           files: files?.files || null,
           prompt,
           responsiveSummary
         };
       }`,
         });

      const payload = parseJsonFromToolText(flattenToolResult(out));
      if (!payload?.ok) {
        throw new Error("Failed to generate replica outputs for --outDir");
      }

      fs.mkdirSync(outDir, { recursive: true });
      const files = payload.files && typeof payload.files === "object" ? payload.files : null;
      if (files) {
        for (const [name, content] of Object.entries(files)) {
          if (!name || typeof content !== "string") continue;
          const filePath = path.join(outDir, name);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content, "utf8");
        }
      }
      if (typeof payload.prompt === "string" && payload.prompt.trim()) {
        fs.writeFileSync(path.join(outDir, "prompt.md"), payload.prompt, "utf8");
      }
      if (payload.responsiveSummary && typeof payload.responsiveSummary === "object") {
        fs.writeFileSync(
          path.join(outDir, "responsive-summary.json"),
          JSON.stringify(payload.responsiveSummary, null, 2),
          "utf8",
        );
      }

      // eslint-disable-next-line no-console
      console.log(
        `[outDir] wrote ${files ? Object.keys(files).length : 0} files${payload.prompt ? " + prompt.md" : ""} to ${outDir}`,
      );
    }

    succeeded = true;
  } finally {
    await cleanup();
    if (succeeded) process.exit(0);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});
