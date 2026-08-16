import { colorDistance, deltaToScore, type Rgb } from "../eval/color.js";
import type { DtcgGroup, DtcgToken } from "../agent/tools.js";
import type { SynthSystem } from "./system.js";

/**
 * Scoring against a synthetic system, where the answer is known exactly.
 *
 * The real-site scorer has to infer intent from what a page happened to
 * declare, and lives with the gaps that leaves: undecidable colours, pages
 * that declare nothing, no control over difficulty. Here the system was
 * generated first, so every dimension is measurable on every sample and the
 * difficulty is a parameter rather than a property of whichever site was
 * available.
 */

export interface SynthScore {
  /** Were the generator's families recovered as groups? Pairwise F1. */
  readonly structureRecovery: number;
  /** Are the system's colours present in the proposal? */
  readonly coverage: number;
  /** Are the proposal's colours part of the system, or invented/decorative? */
  readonly precision: number;
  /** Do family names match the roles they were generated for? */
  readonly roleNaming: number;
  /** Within a family, do the proposal's steps preserve the generated order? */
  readonly stepOrdering: number;
  readonly score: number;
  readonly detail: readonly string[];
}

interface FlatToken {
  readonly path: string;
  readonly group: string;
  readonly leaf: string;
  readonly rgb: Rgb;
}

const HEX = /^#([0-9a-f]{6})$/i;

function parseHex(input: string): Rgb | null {
  const match = HEX.exec(input.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 };
}

function flatten(group: DtcgGroup, prefix = ""): FlatToken[] {
  const out: FlatToken[] = [];
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$")) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && "$value" in value) {
      const raw = (value as DtcgToken).$value;
      const rgb = typeof raw === "string" ? parseHex(raw) : null;
      if (rgb) out.push({ path, group: prefix, leaf: key, rgb });
    } else if (value && typeof value === "object") {
      out.push(...flatten(value as DtcgGroup, path));
    }
  }
  return out;
}

function nearest(target: Rgb, tokens: readonly FlatToken[]): { token: FlatToken; delta: number } | null {
  let best: FlatToken | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    const delta = colorDistance(target, token.rgb);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = token;
    }
  }
  return best ? { token: best, delta: bestDelta } : null;
}

/** Role words a proposal may reasonably use for each generated role. */
const ROLE_WORDS: Readonly<Record<string, RegExp>> = {
  surface: /surface|background|\bbg\b|canvas|base|panel|elevat/i,
  text: /\btext\b|foreground|\bfg\b|\bink\b|content|body|label/i,
  accent: /accent|primary|brand|action|highlight|link/i,
  border: /border|outline|divider|rule|stroke|separator/i,
  status: /success|warning|danger|error|info|status|positive|negative/i,
};

export function scoreAgainstSystem(system: SynthSystem, proposal: DtcgGroup): SynthScore {
  const tokens = flatten(proposal);
  const detail: string[] = [];

  if (tokens.length === 0) {
    return {
      structureRecovery: 0,
      coverage: 0,
      precision: 0,
      roleNaming: 0,
      stepOrdering: 0,
      score: 0,
      detail: ["proposal contains no parsable colour tokens"],
    };
  }

  // -- flatten the truth ----------------------------------------------------
  const truth: { family: string; role: string; step: number; rgb: Rgb }[] = [];
  for (const family of system.families) {
    family.steps.forEach((rgb, index) => {
      truth.push({ family: family.name, role: family.role, step: index, rgb });
    });
  }

  // -- coverage and matching ------------------------------------------------
  const matched = new Map<string, { token: FlatToken; step: number; family: string }[]>();
  let covered = 0;
  for (const entry of truth) {
    const hit = nearest(entry.rgb, tokens);
    // The generator guarantees at least 6 deltaE between any two system
    // colours, so a match inside that radius is unambiguous by construction.
    if (hit && hit.delta <= 5) {
      covered += 1;
      matched.set(entry.family, [
        ...(matched.get(entry.family) ?? []),
        { token: hit.token, step: entry.step, family: entry.family },
      ]);
    }
  }
  const coverage = covered / truth.length;
  if (covered < truth.length) {
    detail.push(`${truth.length - covered}/${truth.length} system colours missing from the proposal`);
  }

  // -- precision: did it adopt colours that are not in the system? ----------
  let inSystem = 0;
  const strays: string[] = [];
  for (const token of tokens) {
    const hit = nearest(
      token.rgb,
      truth.map((entry) => ({ path: "", group: "", leaf: "", rgb: entry.rgb })),
    );
    if (hit && hit.delta <= 5) inSystem += 1;
    else strays.push(token.path);
  }
  const precision = inSystem / tokens.length;
  if (strays.length > 0) {
    detail.push(`${strays.length} proposed tokens are not part of the system (${strays.slice(0, 3).join(", ")})`);
  }

  // -- structure: pairwise F1 over family grouping --------------------------
  const resolved = [...matched.entries()].flatMap(([family, hits]) =>
    hits.map((hit) => ({ family, group: hit.token.group })),
  );
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < resolved.length; i += 1) {
    for (let j = i + 1; j < resolved.length; j += 1) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a || !b) continue;
      const sameTruth = a.family === b.family;
      const sameProposal = a.group === b.group;
      if (sameTruth && sameProposal) tp += 1;
      else if (!sameTruth && sameProposal) fp += 1;
      else if (sameTruth && !sameProposal) fn += 1;
    }
  }
  const structureRecovery = tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
  if (fp > 0) detail.push(`${fp} colour pairs merged that belong to different families`);
  if (fn > 0) detail.push(`${fn} colour pairs split that belong to the same family`);

  // -- role naming ----------------------------------------------------------
  let roleHits = 0;
  let roleTotal = 0;
  for (const family of system.families) {
    const hits = matched.get(family.name);
    if (!hits || hits.length === 0) continue;
    roleTotal += 1;
    const pattern = ROLE_WORDS[family.role];
    // Any of the family's tokens naming the role correctly counts: the
    // question is whether the role was understood, not whether every leaf
    // repeats the word.
    const named = pattern
      ? hits.some((hit) => pattern.test(hit.token.path))
      : false;
    if (named) roleHits += 1;
    else detail.push(`family "${family.name}" (${family.role}) is not named by its role`);
  }
  const roleNaming = roleTotal === 0 ? 0 : roleHits / roleTotal;

  // -- step ordering --------------------------------------------------------
  // Within a recovered family, does the proposal's own numbering follow the
  // generated ramp? Only numbered leaves are checked: a system that names
  // steps `base/raised/overlay` is ordering them correctly in a way no
  // lexical comparison can confirm, and scoring that as wrong would penalise
  // a valid convention.
  let orderChecked = 0;
  let orderCorrect = 0;
  for (const [family, hits] of matched) {
    if (hits.length < 2) continue;
    const numbered = hits
      .map((hit) => ({ hit, index: Number.parseInt(/(\d+)/.exec(hit.token.leaf)?.[1] ?? "", 10) }))
      .filter((entry) => Number.isFinite(entry.index));
    if (numbered.length < 2) continue;

    orderChecked += 1;
    const byTruth = [...numbered].sort((a, b) => a.hit.step - b.hit.step).map((e) => e.index);
    const monotonic = byTruth.every((value, i) => i === 0 || value > (byTruth[i - 1] ?? -Infinity));
    if (monotonic) orderCorrect += 1;
    else detail.push(`family "${family}" numbering does not follow the generated ramp (${byTruth.join(", ")})`);
  }
  const stepOrdering = orderChecked === 0 ? 1 : orderCorrect / orderChecked;

  const score =
    structureRecovery * 0.3 + coverage * 0.2 + precision * 0.2 + roleNaming * 0.2 + stepOrdering * 0.1;

  return {
    structureRecovery: Number(structureRecovery.toFixed(3)),
    coverage: Number(coverage.toFixed(3)),
    precision: Number(precision.toFixed(3)),
    roleNaming: Number(roleNaming.toFixed(3)),
    stepOrdering: Number(stepOrdering.toFixed(3)),
    score: Number(score.toFixed(3)),
    detail: detail.length > 0 ? detail.slice(0, 10) : ["no structural problems found"],
  };
}
