import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runExtraction, type HarnessResult } from "./harness/driver.js";
import { isExtractionPreset, type ExtractionPreset } from "./harness/scripts.js";
import { GOLDEN_SET } from "./eval/golden-set.js";

interface CliArgs {
  readonly urls: readonly string[];
  readonly preset: ExtractionPreset;
  readonly outRoot: string;
  readonly headless: boolean;
  readonly withGroundTruth: boolean;
}

function slugify(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "").replace(/[^a-z0-9]+/gi, "-");
    return `${parsed.hostname}${path}`.replace(/^-+|-+$/g, "").toLowerCase();
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  }
}

async function parseArgs(argv: readonly string[]): Promise<CliArgs> {
  const flags = new Map<string, string>();
  const bare = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      bare.add(key);
    } else {
      flags.set(key, next);
      i += 1;
    }
  }

  const urls: string[] = [];
  const single = flags.get("url");
  if (single) urls.push(single);

  if (bare.has("golden")) {
    for (const site of GOLDEN_SET) urls.push(site.url);
  }

  const batch = flags.get("batch");
  if (batch) {
    const contents = await readFile(resolve(batch), "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) urls.push(trimmed);
    }
  }

  if (urls.length === 0) {
    throw new Error(
      "provide --url <url>, --golden, or --batch <file with one url per line>",
    );
  }

  const presetInput = flags.get("preset") ?? "full";
  if (!isExtractionPreset(presetInput)) {
    throw new Error(`unknown preset: ${presetInput}`);
  }

  return {
    urls,
    preset: presetInput,
    outRoot: resolve(flags.get("out") ?? "runs"),
    headless: !bare.has("headed"),
    withGroundTruth: bare.has("truth"),
  };
}

function summarize(result: HarnessResult): string {
  if (result.ok) {
    const total = Object.values(result.timingsMs).reduce((sum, ms) => sum + ms, 0);
    const failedModules = result.modules?.failed.length ?? 0;
    const moduleNote = failedModules > 0 ? ` (${failedModules} modules failed)` : "";
    const acc = result.accuracy;
    const accNote = acc
      ? `  L2=${acc.score.toFixed(2)} [bg ${acc.surfaceBackground.toFixed(2)} fg ${acc.surfaceForeground.toFixed(2)} ` +
        `pal ${acc.paletteFidelity.toFixed(2)}(r${acc.paletteRecall.toFixed(2)}/p${acc.paletteReality.toFixed(2)} n=${acc.claimedColorCount}) ` +
        `font ${acc.fontAccuracy.toFixed(2)}]  L4=${acc.perception.score.toFixed(2)}(tone ${acc.perception.toneMatch.toFixed(2)})  theme=${acc.themeSwitching}`
      : result.truthError
        ? `  L2=skipped: ${result.truthError.slice(0, 100)}`
        : "";
    return `OK    ${result.url}  ${total}ms${moduleNote}${accNote}`;
  }
  const failure = result.failure;
  return `FAIL  ${result.url}  [${failure?.stage}/${failure?.reason}] ${failure?.message.slice(0, 120)}`;
}

async function main(): Promise<void> {
  const args = await parseArgs(process.argv.slice(2));
  await mkdir(args.outRoot, { recursive: true });

  const results: HarnessResult[] = [];

  for (const [index, url] of args.urls.entries()) {
    process.stdout.write(`[${index + 1}/${args.urls.length}] ${url}\n`);
    const outDir = join(args.outRoot, slugify(url));
    const result = await runExtraction({
      url,
      preset: args.preset,
      outDir,
      headless: args.headless,
      withGroundTruth: args.withGroundTruth,
    });
    results.push(result);
    process.stdout.write(`      ${summarize(result)}\n`);
  }

  await writeFile(
    join(args.outRoot, "results.json"),
    JSON.stringify(
      results.map((r) => ({
        url: r.url,
        preset: r.preset,
        ok: r.ok,
        failure: r.failure,
        timingsMs: r.timingsMs,
        moduleFailures: r.modules?.failed ?? [],
      })),
      null,
      2,
    ),
    "utf8",
  );

  const passed = results.filter((r) => r.ok).length;
  process.stdout.write(`\n${passed}/${results.length} extractions usable\n`);

  if (passed < results.length) {
    const byStage = new Map<string, number>();
    for (const result of results) {
      if (result.ok || !result.failure) continue;
      const key = `${result.failure.stage}/${result.failure.reason}`;
      byStage.set(key, (byStage.get(key) ?? 0) + 1);
    }
    process.stdout.write("failure breakdown:\n");
    for (const [key, count] of [...byStage].sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${count}x ${key}\n`);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
