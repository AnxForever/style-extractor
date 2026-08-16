import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { scoreUsability, type UsabilityScore } from "./eval/usability.js";
import type { AccuracyReport } from "./eval/accuracy.js";
import { GOLDEN_SET } from "./eval/golden-set.js";

interface SiteReport {
  readonly dir: string;
  readonly tags: readonly string[];
  readonly usability: UsabilityScore;
  readonly accuracy?: AccuracyReport;
}

interface RunRecord {
  readonly url: string;
  readonly ok: boolean;
  readonly failure?: { readonly stage: string; readonly reason: string };
}

function siteFor(dir: string) {
  return GOLDEN_SET.find((site) => {
    const host = new URL(site.url).hostname;
    return dir === host || dir.startsWith(host);
  });
}

function bar(value: number, width = 8): string {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function main(): Promise<void> {
  const runRoot = resolve(process.argv[2] ?? "runs/baseline-final");

  let runRecords: RunRecord[] = [];
  try {
    runRecords = JSON.parse(await readFile(join(runRoot, "results.json"), "utf8")) as RunRecord[];
  } catch {
    // Report still works from artifacts alone; L1 section is simply omitted.
  }

  const entries = await readdir(runRoot, { withFileTypes: true });
  const reports: SiteReport[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let usability: UsabilityScore;
    try {
      usability = scoreUsability(
        JSON.parse(await readFile(join(runRoot, entry.name, "extraction.json"), "utf8")),
      );
    } catch {
      continue;
    }
    let accuracy: AccuracyReport | undefined;
    try {
      const parsed = JSON.parse(
        await readFile(join(runRoot, entry.name, "ground-truth.json"), "utf8"),
      ) as { accuracy?: AccuracyReport };
      accuracy = parsed.accuracy;
    } catch {
      // Ground truth is optional; absence is reported as a blank cell.
    }
    reports.push({ dir: entry.name, tags: siteFor(entry.name)?.tags ?? [], usability, accuracy });
  }

  reports.sort((a, b) => (a.accuracy?.score ?? 0) - (b.accuracy?.score ?? 0));

  const lines: string[] = [];
  lines.push("# Extraction baseline");
  lines.push("");
  lines.push(`Run: \`${runRoot}\``);
  lines.push("");

  // -- L1 -------------------------------------------------------------------
  if (runRecords.length > 0) {
    const ok = runRecords.filter((r) => r.ok).length;
    lines.push("## L1 reachability");
    lines.push("");
    lines.push(`${ok}/${runRecords.length} sites produced a usable extraction.`);
    const failures = runRecords.filter((r) => !r.ok && r.failure);
    if (failures.length > 0) {
      lines.push("");
      for (const failure of failures) {
        lines.push(
          `- \`${failure.url}\` -> ${failure.failure?.stage}/${failure.failure?.reason}`,
        );
      }
    }
    lines.push("");
  }

  // -- L2 / L4 --------------------------------------------------------------
  lines.push("## L2 accuracy and L4 perception");
  lines.push("");
  lines.push("| site | L2 | bg | fg | recall | precision | claimed | font | theme | L4 | tone |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const report of reports) {
    const a = report.accuracy;
    if (!a) {
      lines.push(`| ${report.dir} | - | - | - | - | - | - | - | - | - | - |`);
      continue;
    }
    lines.push(
      `| ${report.dir} | ${a.score.toFixed(2)} \`${bar(a.score)}\` | ${a.surfaceBackground.toFixed(2)} | ` +
        `${a.surfaceForeground.toFixed(2)} | ${a.paletteRecall.toFixed(2)} | ${a.paletteReality.toFixed(2)} | ` +
        `${a.claimedColorCount} | ${a.fontAccuracy.toFixed(2)} | ${a.themeSwitching} | ` +
        `${a.perception.score.toFixed(2)} | ${a.perception.toneMatch.toFixed(2)} |`,
    );
  }

  const scored = reports.filter((r): r is SiteReport & { accuracy: AccuracyReport } => !!r.accuracy);
  lines.push("");
  lines.push("### Aggregate");
  lines.push("");
  lines.push(`- mean L2: **${mean(scored.map((r) => r.accuracy.score)).toFixed(3)}**`);
  lines.push(
    `- mean palette recall: **${mean(scored.map((r) => r.accuracy.paletteRecall)).toFixed(3)}** ` +
      `vs mean precision: **${mean(scored.map((r) => r.accuracy.paletteReality)).toFixed(3)}**`,
  );
  lines.push(`- mean L4 perception: **${mean(scored.map((r) => r.accuracy.perception.score)).toFixed(3)}**`);

  const bgWrong = scored.filter((r) => r.accuracy.surfaceBackground < 0.5);
  lines.push(`- sites with a wrong page background: **${bgWrong.length}/${scored.length}**`);
  if (bgWrong.length > 0) lines.push(`  - ${bgWrong.map((r) => r.dir).join(", ")}`);

  const themeCounts = new Map<string, string[]>();
  for (const report of scored) {
    const key = report.accuracy.themeSwitching;
    themeCounts.set(key, [...(themeCounts.get(key) ?? []), report.dir]);
  }
  lines.push("");
  lines.push("### Theme switching");
  lines.push("");
  for (const [verdict, sites] of [...themeCounts].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`- **${verdict}**: ${sites.length} — ${sites.join(", ")}`);
  }

  // -- L3 -------------------------------------------------------------------
  lines.push("");
  lines.push("## L3 usability");
  lines.push("");
  lines.push("| site | L3 | payload | leaves | uniq names | design tokens | KB/token | redundancy |");
  lines.push("|---|---|---|---|---|---|---|---|");
  const byUsability = [...reports].sort((a, b) => a.usability.score - b.usability.score);
  for (const report of byUsability) {
    const u = report.usability;
    lines.push(
      `| ${report.dir} | ${u.score.toFixed(2)} \`${bar(u.score)}\` | ${(u.payloadBytes / 1024).toFixed(0)} KB | ` +
        `${u.totalLeaves} | ${u.totalNames} | ${u.signalNames} | ` +
        `${u.bytesPerSignal < 0 ? "n/a" : (u.bytesPerSignal / 1024).toFixed(1)} | ${u.redundancy}x |`,
    );
  }

  const payloadTotal = reports.reduce((sum, r) => sum + r.usability.payloadBytes, 0);
  const tokensTotal = reports.reduce((sum, r) => sum + r.usability.signalNames, 0);
  lines.push("");
  lines.push("### Aggregate");
  lines.push("");
  lines.push(`- mean L3: **${mean(reports.map((r) => r.usability.score)).toFixed(3)}**`);
  lines.push(`- total payload: **${(payloadTotal / 1024 / 1024).toFixed(2)} MB**`);
  lines.push(`- total usable design tokens: **${tokensTotal}**`);
  lines.push(
    `- average cost: **${(payloadTotal / 1024 / Math.max(1, tokensTotal)).toFixed(1)} KB per usable token**`,
  );

  const noiseTotals = new Map<string, number>();
  for (const report of reports) {
    for (const [cls, count] of Object.entries(report.usability.noiseByClass)) {
      noiseTotals.set(cls, (noiseTotals.get(cls) ?? 0) + count);
    }
  }
  lines.push("");
  lines.push("### Noise attribution");
  lines.push("");
  for (const [cls, count] of [...noiseTotals].sort((a, b) => b[1] - a[1])) {
    if (count > 0) lines.push(`- ${cls}: ${count}`);
  }

  const output = lines.join("\n") + "\n";
  await writeFile(join(runRoot, "baseline-report.md"), output, "utf8");
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
