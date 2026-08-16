import { colorDistance, JND, type Rgb } from "./color.js";
import {
  collectDeclarations,
  parseDeclaredColor,
  readAuthorIntent,
  type AuthorIntent,
} from "./author-intent.js";
import type { DtcgGroup, DtcgToken } from "../agent/tools.js";

/**
 * Scoring for the parts of the task that have no mechanical form.
 *
 * The value-oriented scorer this supplements was fully satisfiable by rules --
 * a heuristic reached 0.99 on every site, leaving a model nothing to add. The
 * cause was that its dimensions were lookups: coverage and precision are table
 * comparisons, and the survey tool printed the surface and text colours
 * outright, so identifying them required no judgement.
 *
 * These dimensions instead measure organisation, and are graded against what
 * the page's own authors declared. Recovering the grouping from bare values is
 * genuinely hard: an extractor sees `#141414 #262626 #666 #fff #fdfdfd` as
 * five unrelated colours, while the author declared two families of elevation
 * steps. Nothing in the values themselves says so.
 *
 * Every dimension reports "not applicable" when the page provides no reference
 * for it, rather than scoring zero. Tailwind-compiled sites inline their
 * variables and declare nothing; penalising a proposal for that would measure
 * the page's build tooling, not the proposal.
 */

export interface Judged {
  readonly value: number | null;
  readonly detail: string;
}

export interface JudgementScore {
  /** Did the proposal recover the author's grouping of colours into families? */
  readonly structureRecovery: Judged;
  /** Did it recover surface/foreground pairings? */
  readonly pairingRecovery: Judged;
  /** Does it reuse the author's vocabulary rather than inventing its own? */
  readonly vocabularyAlignment: Judged;
  /** Did it avoid adopting third-party widget colours as design tokens? */
  readonly noiseRejection: Judged;
  /** Mean of the applicable dimensions, or null when none apply. */
  readonly score: number | null;
  readonly applicable: number;
}

interface FlatToken {
  /** Dotted path, e.g. "color.bg.raised". */
  readonly path: string;
  /** Group the token sits in, e.g. "color.bg". */
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

/** Nearest proposed token to a declared colour, within perceptual tolerance. */
function nearest(target: Rgb, tokens: readonly FlatToken[]): FlatToken | null {
  let best: FlatToken | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    const delta = colorDistance(target, token.rgb);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = token;
    }
  }
  // Beyond a clearly visible difference it is a different colour, not a match.
  return bestDelta <= 10 ? best : null;
}

/**
 * Declared colours that cannot be attributed to one family by value alone.
 *
 * Real systems reuse a colour across roles: shadcn declares `--background`,
 * `--card` and `--popover` all as #fff. A proposal is matched to declarations
 * by colour, so those three are indistinguishable from the outside, and any
 * grouping verdict about them would be an artefact of which one the matcher
 * happened to pick. They are excluded rather than scored, because a metric
 * that reports confident numbers on undecidable cases is worse than one that
 * reports fewer.
 */
function ambiguousColors(intent: AuthorIntent): Set<string> {
  const familiesByColor = new Map<string, Set<string>>();
  for (const variable of intent.variables) {
    const key = `${variable.rgb.r},${variable.rgb.g},${variable.rgb.b}`;
    familiesByColor.set(key, (familiesByColor.get(key) ?? new Set()).add(variable.family));
  }
  const ambiguous = new Set<string>();
  for (const [key, families] of familiesByColor) {
    if (families.size > 1) ambiguous.add(key);
  }
  return ambiguous;
}

function colorKey(rgb: Rgb): string {
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

/**
 * Pairwise F1 over the grouping, the standard way to compare two clusterings.
 *
 * Plain agreement would be misleading here: most colour pairs belong to
 * different families, so a proposal that groups nothing at all would score
 * highly on "correctly separated" pairs alone. F1 over same-family pairs
 * measures what is actually being asked -- whether the families were found.
 */
function scoreStructure(intent: AuthorIntent, tokens: readonly FlatToken[]): Judged {
  const grouped = [...intent.families.values()].flat();
  if (intent.families.size === 0 || grouped.length < 3) {
    return { value: null, detail: "page declares no multi-member colour families" };
  }

  const ambiguous = ambiguousColors(intent);
  const byName = new Map(intent.variables.map((v) => [v.name, v]));
  const resolved: { name: string; family: string; token: FlatToken }[] = [];
  let skipped = 0;
  for (const name of grouped) {
    const variable = byName.get(name);
    if (!variable) continue;
    if (ambiguous.has(colorKey(variable.rgb))) {
      skipped += 1;
      continue;
    }
    const token = nearest(variable.rgb, tokens);
    if (token) resolved.push({ name, family: variable.family, token });
  }

  if (resolved.length < 3) {
    return {
      value: null,
      detail:
        `only ${resolved.length} declared family colours are unambiguously matchable ` +
        `(${skipped} shared across families)`,
    };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < resolved.length; i += 1) {
    for (let j = i + 1; j < resolved.length; j += 1) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a || !b) continue;
      const sameForAuthor = a.family === b.family;
      const sameForProposal = a.token.group === b.token.group;
      if (sameForAuthor && sameForProposal) tp += 1;
      else if (!sameForAuthor && sameForProposal) fp += 1;
      else if (sameForAuthor && !sameForProposal) fn += 1;
    }
  }

  const f1 = tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
  return {
    value: Number(f1.toFixed(3)),
    detail:
      `${intent.families.size} declared families; pairwise tp=${tp} fp=${fp} fn=${fn}` +
      (skipped > 0 ? `; ${skipped} colours skipped as shared across families` : ""),
  };
}

function scorePairing(intent: AuthorIntent, tokens: readonly FlatToken[]): Judged {
  if (intent.pairs.length === 0) {
    return { value: null, detail: "page declares no surface/foreground pairs" };
  }
  const ambiguous = ambiguousColors(intent);
  const byName = new Map(intent.variables.map((v) => [v.name, v]));

  let matched = 0;
  let judged = 0;
  for (const [surfaceName, textName] of intent.pairs) {
    const surface = byName.get(surfaceName);
    const text = byName.get(textName);
    if (!surface || !text) continue;
    // A pair whose colours are reused elsewhere cannot be traced back through
    // value matching; scoring it would measure the matcher, not the proposal.
    if (ambiguous.has(colorKey(surface.rgb)) || ambiguous.has(colorKey(text.rgb))) continue;
    judged += 1;
    const surfaceToken = nearest(surface.rgb, tokens);
    const textToken = nearest(text.rgb, tokens);
    // The pair is recovered when both colours exist and sit together, which is
    // how a consumer knows which text colour belongs on which surface.
    if (surfaceToken && textToken && surfaceToken.group === textToken.group) matched += 1;
  }
  if (judged === 0) {
    return { value: null, detail: "declared pairs all reuse colours found elsewhere" };
  }
  return {
    value: Number((matched / judged).toFixed(3)),
    detail: `${matched}/${judged} declared pairs kept together (${intent.pairs.length - judged} undecidable)`,
  };
}

function scoreVocabulary(intent: AuthorIntent, tokens: readonly FlatToken[]): Judged {
  if (intent.vocabulary.size === 0) {
    return { value: null, detail: "page declares no named colour variables" };
  }
  if (tokens.length === 0) return { value: 0, detail: "proposal has no tokens" };

  const words = new Set<string>();
  for (const token of tokens) {
    for (const part of token.path.split(/[.\-_]/)) {
      const word = part.toLowerCase();
      // Two characters, matching the author-side threshold: fg and bg are real
      // vocabulary, and a mismatched threshold would score correct reuse as zero.
      if (word.length >= 2 && !/^\d+$/.test(word)) words.add(word);
    }
  }
  // "color" is a container name in every system and says nothing about reuse.
  words.delete("color");
  words.delete("colour");

  if (words.size === 0) return { value: 0, detail: "proposal uses no meaningful words" };
  const shared = [...words].filter((word) => intent.vocabulary.has(word));
  return {
    value: Number((shared.length / words.size).toFixed(3)),
    detail: `${shared.length}/${words.size} proposal words appear in the author's vocabulary`,
  };
}

function scoreNoiseRejection(
  intent: AuthorIntent,
  tokens: readonly FlatToken[],
  extraction: unknown,
): Judged {
  if (intent.rejected.length === 0) {
    return { value: null, detail: "page declares no third-party colour variables" };
  }
  const declarations = collectDeclarations(extraction);
  const noiseColors: Rgb[] = [];
  for (const name of intent.rejected) {
    const raw = declarations.get(name);
    if (!raw) continue;
    const rgb = parseDeclaredColor(raw);
    if (rgb) noiseColors.push(rgb);
  }
  if (noiseColors.length === 0) {
    return { value: null, detail: "third-party variables declare no parsable colours" };
  }
  if (tokens.length === 0) return { value: 0, detail: "proposal has no tokens" };

  // A design colour and a widget colour can legitimately coincide; only an
  // exact perceptual match to a third-party value counts as adoption.
  let adopted = 0;
  for (const token of tokens) {
    const isNoise = noiseColors.some((noise) => colorDistance(token.rgb, noise) <= JND);
    if (isNoise) adopted += 1;
  }
  return {
    value: Number((1 - adopted / tokens.length).toFixed(3)),
    detail: `${adopted}/${tokens.length} tokens match a third-party widget colour`,
  };
}

export function judgeProposal(extraction: unknown, proposal: DtcgGroup): JudgementScore {
  const intent = readAuthorIntent(extraction);
  const tokens = flatten(proposal);

  // With no semantic declarations of its own, the page provides no statement of
  // intent to grade against. Third-party variables alone are not a reference:
  // scoring only "did you avoid the widget colours" would produce a confident
  // number about a page whose design language is entirely unknown here.
  if (intent.variables.length === 0) {
    const none: Judged = { value: null, detail: "page declares no semantic colour variables" };
    return {
      structureRecovery: none,
      pairingRecovery: none,
      vocabularyAlignment: none,
      noiseRejection: none,
      score: null,
      applicable: 0,
    };
  }

  const structureRecovery = scoreStructure(intent, tokens);
  const pairingRecovery = scorePairing(intent, tokens);
  const vocabularyAlignment = scoreVocabulary(intent, tokens);
  const noiseRejection = scoreNoiseRejection(intent, tokens, extraction);

  const applicable = [structureRecovery, pairingRecovery, vocabularyAlignment, noiseRejection].filter(
    (d): d is Judged & { value: number } => d.value !== null,
  );

  return {
    structureRecovery,
    pairingRecovery,
    vocabularyAlignment,
    noiseRejection,
    score:
      applicable.length === 0
        ? null
        : Number((applicable.reduce((sum, d) => sum + d.value, 0) / applicable.length).toFixed(3)),
    applicable: applicable.length,
  };
}
