import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runExtraction } from "./harness/driver.js";
import { runAgentLoop } from "./agent/loop.js";
import { createAnthropicProvider } from "./agent/provider.js";
import { createHeuristicProvider } from "./agent/heuristic.js";
import { createTracer } from "./agent/trace.js";
import type { AgentWorkspace, DtcgGroup } from "./agent/tools.js";
import { generateSystem, systemTokens, toHex } from "./synth/system.js";
import { renderPage, DIFFICULTIES, type Difficulty } from "./synth/page.js";
import { scoreAgainstSystem, type SynthScore } from "./synth/score.js";

/**
 * Run the inverted benchmark: generate a design system, render it into a real
 * page, then measure how much of it can be recovered.
 *
 * Sweeping difficulty is the point. A single number says little; the shape of
 * the curve as clues are withdrawn says whether a system is reading names or
 * reading design.
 */

interface Cell {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly score: SynthScore | null;
  readonly note?: string;
}

function parseArgs(argv: readonly string[]) {
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
  return { flags, bare };
}

async function main(): Promise<void> {
  const { flags, bare } = parseArgs(process.argv.slice(2));

  const seeds = (flags.get("seeds") ?? "1,2,3")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const requested = flags.get("difficulty") ?? "all";
  const difficulties: readonly Difficulty[] =
    requested === "all"
      ? DIFFICULTIES
      : (requested.split(",").map((d) => d.trim()) as Difficulty[]).filter((d) =>
          DIFFICULTIES.includes(d),
        );

  const outRoot = resolve(flags.get("out") ?? "runs/synth");
  await mkdir(outRoot, { recursive: true });

  const useHeuristic = bare.has("heuristic");
  const providerLabel = useHeuristic ? "heuristic" : (flags.get("model") ?? "model");

  process.stdout.write(
    `synthetic benchmark: ${seeds.length} seeds x ${difficulties.length} difficulties, agent=${providerLabel}\n\n`,
  );

  const cells: Cell[] = [];

  for (const seed of seeds) {
    const system = generateSystem({
      seed,
      stepsPerFamily: Number(flags.get("steps") ?? 4),
      extraFamilies: Number(flags.get("extras") ?? 2),
    });

    for (const difficulty of difficulties) {
      const caseDir = join(outRoot, `seed-${seed}-${difficulty}`);
      await mkdir(caseDir, { recursive: true });

      const html = renderPage({ system, difficulty });
      const pagePath = join(caseDir, "page.html");
      await writeFile(pagePath, html, "utf8");
      await writeFile(
        join(caseDir, "truth.json"),
        JSON.stringify(
          {
            seed,
            difficulty,
            families: system.families.map((f) => ({
              name: f.name,
              role: f.role,
              steps: f.steps.map(toHex),
            })),
            tokens: Object.fromEntries([...systemTokens(system)].map(([k, v]) => [k, toHex(v)])),
          },
          null,
          2,
        ),
        "utf8",
      );

      const harness = await runExtraction({
        url: pathToFileURL(pagePath).href,
        preset: "style",
        outDir: caseDir,
        withGroundTruth: true,
      });

      if (!harness.ok || !harness.truth || !harness.accuracy) {
        const note = harness.failure
          ? `${harness.failure.stage}/${harness.failure.reason}`
          : (harness.truthError ?? "no ground truth");
        cells.push({ seed, difficulty, score: null, note });
        process.stdout.write(`  seed ${seed} ${difficulty.padEnd(9)} extraction failed: ${note}\n`);
        continue;
      }

      const workspace: AgentWorkspace = {
        extraction: harness.extraction,
        truth: harness.truth,
        claimedColors: harness.accuracy.resolvedColors,
      };

      const provider = useHeuristic
        ? createHeuristicProvider()
        : createAnthropicProvider({ ...(flags.get("model") ? { model: flags.get("model")! } : {}) });

      const result = await runAgentLoop({
        provider,
        workspace,
        tracer: createTracer(join(caseDir, "agent-trace.jsonl")),
        goal:
          "Recover the design system used by this page. Group colours into the families " +
          "they belong to and name each family by its role.",
        maxTurns: Number(flags.get("max-turns") ?? 12),
      });

      if (!result.bestProposal) {
        cells.push({ seed, difficulty, score: null, note: result.reason });
        process.stdout.write(`  seed ${seed} ${difficulty.padEnd(9)} no proposal (${result.reason})\n`);
        continue;
      }

      const score = scoreAgainstSystem(system, result.bestProposal as DtcgGroup);
      cells.push({ seed, difficulty, score });
      await writeFile(join(caseDir, "score.json"), JSON.stringify(score, null, 2), "utf8");

      process.stdout.write(
        `  seed ${seed} ${difficulty.padEnd(9)} ${score.score.toFixed(3)}  ` +
          `[struct ${score.structureRecovery.toFixed(2)} cov ${score.coverage.toFixed(2)} ` +
          `prec ${score.precision.toFixed(2)} role ${score.roleNaming.toFixed(2)} order ${score.stepOrdering.toFixed(2)}]\n`,
      );
    }
  }

  // -- difficulty curve -----------------------------------------------------
  process.stdout.write("\ndifficulty curve (mean across seeds)\n\n");
  process.stdout.write("| difficulty | score | structure | coverage | precision | role | order |\n");
  process.stdout.write("|---|---|---|---|---|---|---|\n");

  const lines: string[] = [];
  for (const difficulty of difficulties) {
    const scored = cells
      .filter((c) => c.difficulty === difficulty && c.score !== null)
      .map((c) => c.score as SynthScore);
    if (scored.length === 0) {
      lines.push(`| ${difficulty} | - | - | - | - | - | - |`);
      continue;
    }
    const mean = (pick: (s: SynthScore) => number): string =>
      (scored.reduce((sum, s) => sum + pick(s), 0) / scored.length).toFixed(3);
    lines.push(
      `| ${difficulty} | **${mean((s) => s.score)}** | ${mean((s) => s.structureRecovery)} | ` +
        `${mean((s) => s.coverage)} | ${mean((s) => s.precision)} | ${mean((s) => s.roleNaming)} | ` +
        `${mean((s) => s.stepOrdering)} |`,
    );
  }
  const table = lines.join("\n");
  process.stdout.write(`${table}\n`);

  // -- diagnosis ------------------------------------------------------------
  // A single number hides which of two very different systems produced it.
  // Peak says how well it does with every clue available; robustness says how
  // much survives once the names are taken away. Read together they separate
  // "reads names" from "reads design" -- and expose the case that looks strong
  // by accident, where robustness is high only because the clues were never
  // used in the first place.
  const meanFor = (difficulty: Difficulty): number | null => {
    const scored = cells
      .filter((c) => c.difficulty === difficulty && c.score !== null)
      .map((c) => (c.score as SynthScore).score);
    return scored.length === 0 ? null : scored.reduce((a, b) => a + b, 0) / scored.length;
  };

  const peak = meanFor("declared");
  const stripped = meanFor("inlined");
  if (peak !== null && stripped !== null && peak > 0) {
    const robustness = stripped / peak;
    process.stdout.write("\ndiagnosis\n\n");
    process.stdout.write(`  peak (declared)        ${peak.toFixed(3)}\n`);
    process.stdout.write(`  stripped (inlined)     ${stripped.toFixed(3)}\n`);
    process.stdout.write(`  robustness             ${robustness.toFixed(3)}\n\n`);

    const verdict =
      robustness > 0.95 && peak < 0.85
        ? "clue-blind: taking the names away changes nothing, so the names were never being read"
        : robustness > 0.95
          ? "recovers structure from the rendering itself, not from naming"
          : robustness < 0.7
            ? "depends on declared names; degrades sharply when they are withheld"
            : "uses names where present and partially recovers structure without them";
    process.stdout.write(`  ${verdict}\n`);
  }

  await writeFile(
    join(outRoot, "results.json"),
    JSON.stringify({ agent: providerLabel, seeds, difficulties, cells }, null, 2),
    "utf8",
  );
  await writeFile(
    join(outRoot, "curve.md"),
    `# Synthetic benchmark: ${providerLabel}\n\nSeeds: ${seeds.join(", ")}\n\n` +
      "| difficulty | score | structure | coverage | precision | role | order |\n|---|---|---|---|---|---|---|\n" +
      `${table}\n`,
    "utf8",
  );

  process.stdout.write(`\nartifacts in ${outRoot}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
