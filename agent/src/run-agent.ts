import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runExtraction } from "./harness/driver.js";
import { isExtractionPreset } from "./harness/scripts.js";
import { runAgentLoop } from "./agent/loop.js";
import { createAnthropicProvider, createMockProvider } from "./agent/provider.js";
import { createHeuristicProvider } from "./agent/heuristic.js";
import { createTracer, summarizeTrace } from "./agent/trace.js";
import { scoreProposal, type AgentWorkspace } from "./agent/tools.js";
import { toDtcgDocument, validateDtcg, serializeDtcg, DTCG_VERSION } from "./export/dtcg.js";

/**
 * End-to-end: measure a page, then let the agent turn those measurements into
 * a design token set, scoring itself against the measurements as it goes.
 */

function slugify(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) bare.add(token.slice(2));
    else {
      flags.set(token.slice(2), next);
      i += 1;
    }
  }

  const url = flags.get("url");
  if (!url) throw new Error("provide --url <url>");

  const presetInput = flags.get("preset") ?? "style";
  if (!isExtractionPreset(presetInput)) throw new Error(`unknown preset: ${presetInput}`);

  const outDir = resolve(flags.get("out") ?? join("runs/agent", slugify(url)));
  await mkdir(outDir, { recursive: true });

  process.stdout.write(`[1/2] measuring ${url}\n`);
  const harness = await runExtraction({
    url,
    preset: presetInput,
    outDir,
    withGroundTruth: true,
  });

  if (!harness.ok || !harness.truth || !harness.accuracy) {
    const detail = harness.failure
      ? `${harness.failure.stage}/${harness.failure.reason}: ${harness.failure.message}`
      : (harness.truthError ?? "ground truth unavailable");
    process.stderr.write(`      measurement failed -- ${detail}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `      L2=${harness.accuracy.score.toFixed(2)} L4=${harness.accuracy.perception.score.toFixed(2)} ` +
      `theme=${harness.accuracy.themeSwitching}\n`,
  );

  const workspace: AgentWorkspace = {
    extraction: harness.extraction,
    truth: harness.truth,
    claimedColors: harness.accuracy.resolvedColors,
  };

  // Baseline for comparison: score the raw extraction's colours as if they had
  // been proposed verbatim. Without it there is no way to tell whether the
  // agent added value or merely restated what it was given.
  const rawAsProposal: AgentWorkspace = {
    ...workspace,
    proposal: {
      color: Object.fromEntries(
        harness.accuracy.resolvedColors.slice(0, 200).map((c, i) => {
          const p = (n: number): string => Math.round(n).toString(16).padStart(2, "0");
          return [`c${i}`, { $value: `#${p(c.r)}${p(c.g)}${p(c.b)}`, $type: "color" }];
        }),
      ),
    },
  };
  const rawScore = scoreProposal(rawAsProposal);

  const useMock = bare.has("mock");
  const useHeuristic = bare.has("heuristic");
  const provider = useHeuristic
    ? createHeuristicProvider()
    : useMock
      ? createMockProvider([{ text: "mock provider: no model configured" }])
      : createAnthropicProvider({ ...(flags.get("model") ? { model: flags.get("model")! } : {}) });

  const tracePath = join(outDir, "agent-trace.jsonl");
  const tracer = createTracer(tracePath);

  process.stdout.write(`[2/2] agent (${provider.name})\n`);
  const result = await runAgentLoop({
    provider,
    workspace,
    tracer,
    goal:
      `Produce a design token set for ${url}. ` +
      `Survey the measurements first, then propose and refine.`,
    maxTurns: Number(flags.get("max-turns") ?? 12),
  });

  process.stdout.write(`${summarizeTrace(tracer)}\n`);

  await writeFile(
    join(outDir, "agent-result.json"),
    JSON.stringify(
      {
        url,
        reason: result.reason,
        turns: result.turns,
        usage: result.usage,
        error: result.error,
        rawExtractionScore: rawScore,
        agentScore: result.bestScore,
        tokens: result.bestProposal,
      },
      null,
      2,
    ),
    "utf8",
  );

  process.stdout.write("\n");
  process.stdout.write(`raw extraction, scored as-is : ${rawScore.score.toFixed(3)} `);
  process.stdout.write(`(coverage ${rawScore.coverage}, reality ${rawScore.reality}, role ${rawScore.roleAccuracy}, naming ${rawScore.semanticNaming})\n`);
  if (result.bestScore) {
    process.stdout.write(`agent proposal               : ${result.bestScore.score.toFixed(3)} `);
    process.stdout.write(
      `(coverage ${result.bestScore.coverage}, reality ${result.bestScore.reality}, role ${result.bestScore.roleAccuracy}, naming ${result.bestScore.semanticNaming})\n`,
    );
  } else {
    process.stdout.write(`agent proposal               : none (${result.reason}${result.error ? `: ${result.error}` : ""})\n`);
  }

  // Emit the standard format alongside the raw result. Validation runs on the
  // way out so a malformed document is reported here rather than discovered by
  // whichever tool consumes it later.
  if (result.bestProposal) {
    const document = toDtcgDocument(result.bestProposal, { source: url });
    const issues = validateDtcg(document);
    await writeFile(join(outDir, "tokens.tokens.json"), serializeDtcg(document), "utf8");

    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    process.stdout.write(
      `\nDTCG ${DTCG_VERSION}: ${errors.length} errors, ${warnings.length} warnings -> tokens.tokens.json\n`,
    );
    for (const issue of issues.slice(0, 8)) {
      process.stdout.write(`  ${issue.severity}: ${issue.path || "(root)"} -- ${issue.message}\n`);
    }
  }

  process.stdout.write(`\nartifacts in ${outDir}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
