/**
 * L3: is the output usable?
 *
 * An extraction can be perfectly accurate and still worthless. Dumping every
 * CSS custom property a page defines yields a payload where the handful of
 * real brand decisions are buried under framework internals, third-party
 * widget variables, and build-tool artifacts. This module measures that
 * signal-to-noise ratio and, more importantly, attributes the noise so the
 * fix is obvious.
 */

export type NoiseClass =
  /** Compiler-generated variables that exist to implement a utility framework. */
  | "framework-internal"
  /** Variables owned by an embedded widget, not by the site's design system. */
  | "third-party-widget"
  /** Hashed identifiers emitted by a bundler or CSS Modules. */
  | "build-artifact"
  /** Positioning/measurement variables published by headless UI primitives. */
  | "headless-ui"
  /**
   * Name matched no known noise pattern and carries no design semantics.
   * Kept separate on purpose: folding these into build-artifact would inflate
   * that bucket and point remediation at the wrong problem.
   */
  | "unclassified";

interface NoisePattern {
  readonly cls: NoiseClass;
  readonly test: RegExp;
  readonly note: string;
}

const NOISE_PATTERNS: readonly NoisePattern[] = [
  { cls: "framework-internal", test: /--tw-/i, note: "Tailwind internal" },
  { cls: "framework-internal", test: /--lightningcss-/i, note: "LightningCSS" },
  { cls: "framework-internal", test: /--next-/i, note: "Next.js internal" },
  { cls: "framework-internal", test: /--bs-/i, note: "Bootstrap internal" },
  { cls: "third-party-widget", test: /docsearch/i, note: "Algolia DocSearch" },
  { cls: "third-party-widget", test: /--(?:swiper|splide|glide)-/i, note: "carousel library" },
  { cls: "third-party-widget", test: /--(?:fa|font-awesome)-/i, note: "icon font" },
  { cls: "headless-ui", test: /--(?:radix|headlessui|reach|ariakit)-/i, note: "headless UI" },
  { cls: "build-artifact", test: /-module__|_[a-f0-9]{8}-module|\b[a-z]+_[a-f0-9]{6,}\b/i, note: "CSS Modules hash" },
];

/** Names that read like a deliberate design decision rather than plumbing. */
const SIGNAL_TOKEN = new RegExp(
  [
    "colou?r",
    "bg|background",
    "foreground|text",
    "border|outline|ring",
    "primary|secondary|accent|brand",
    "muted|subtle|surface|elevated",
    "success|warning|danger|error|info",
    "font|type|leading|tracking",
    "space|spacing|gap|inset",
    "radius|rounded",
    "shadow|elevation",
  ].join("|"),
  "i",
);

export interface TokenVerdict {
  readonly name: string;
  readonly kind: "signal" | "noise";
  readonly noiseClass?: NoiseClass;
  readonly note?: string;
}

export interface UsabilityScore {
  /** Share of extracted names that look like real design decisions, 0..1. */
  readonly signalRatio: number;
  /** Distinct colour values found. A design system that never converges is unusable. */
  readonly distinctColors: number;
  /** 0..1; penalises palettes far past what a human system would define. */
  readonly colorConvergence: number;
  readonly payloadBytes: number;
  readonly totalNames: number;
  /** Count of design-intent names, i.e. what a consumer could actually adopt. */
  readonly signalNames: number;
  /** Every scalar in the payload, including repeats of the same variable. */
  readonly totalLeaves: number;
  /** totalLeaves / totalNames. High values mean the same facts restated per selector. */
  readonly redundancy: number;
  /** Bytes of payload per usable token. The headline cost-of-consumption number. */
  readonly bytesPerSignal: number;
  /** 0..1; collapses toward 0 as payload cost per usable token explodes. */
  readonly density: number;
  readonly noiseByClass: Readonly<Record<NoiseClass, number>>;
  /** Worst offenders, for the report. */
  readonly topNoise: readonly TokenVerdict[];
  /** Combined 0..1. */
  readonly score: number;
}

function classify(name: string): TokenVerdict {
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test.test(name)) {
      return { name, kind: "noise", noiseClass: pattern.cls, note: pattern.note };
    }
  }
  if (SIGNAL_TOKEN.test(name)) return { name, kind: "signal" };
  return { name, kind: "noise", noiseClass: "unclassified", note: "unsemantic name" };
}

/** Collect every CSS custom property name appearing anywhere in the payload. */
function collectCustomProperties(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) collectCustomProperties(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.startsWith("--")) out.add(key);
      collectCustomProperties(value, out, depth + 1);
    }
  }
}

const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|oklab|lch|oklch)\([^)]*\)/gi;

/**
 * Design systems converge. Hand-built ones land somewhere under ~40 distinct
 * values; anything past a few hundred means raw computed values were dumped
 * without clustering, which is not something a human can adopt.
 */
function convergenceScore(distinct: number): number {
  if (distinct <= 40) return 1;
  if (distinct >= 400) return 0;
  return 1 - (distinct - 40) / 360;
}

/** Count every scalar in the payload, repeats included. */
function countLeaves(node: unknown, depth = 0): number {
  if (depth > 14 || node === null || node === undefined) return 1;
  if (Array.isArray(node)) {
    return node.reduce<number>((sum, item) => sum + countLeaves(item, depth + 1), 0);
  }
  if (typeof node === "object") {
    return Object.values(node as Record<string, unknown>).reduce<number>(
      (sum, value) => sum + countLeaves(value, depth + 1),
      0,
    );
  }
  return 1;
}

/**
 * Cost of consumption. A hand-written tokens file carries a usable decision
 * every few hundred bytes; once a payload spends tens of kilobytes per usable
 * token, a human has to mine it before they can use it, which is exactly the
 * "too messy to use" failure this metric exists to catch.
 */
function densityScore(bytesPerSignal: number): number {
  if (!Number.isFinite(bytesPerSignal)) return 0;
  if (bytesPerSignal <= 500) return 1;
  if (bytesPerSignal >= 50_000) return 0;
  // Log scale: each order of magnitude past 500B costs roughly half the score.
  return Math.max(0, 1 - Math.log10(bytesPerSignal / 500) / Math.log10(100));
}

export function scoreUsability(extraction: unknown): UsabilityScore {
  const serialized = JSON.stringify(extraction ?? null) ?? "";
  const payloadBytes = Buffer.byteLength(serialized, "utf8");

  const names = new Set<string>();
  collectCustomProperties(extraction, names);

  const verdicts = [...names].map(classify);
  const signals = verdicts.filter((v) => v.kind === "signal");

  const noiseByClass: Record<NoiseClass, number> = {
    "framework-internal": 0,
    "third-party-widget": 0,
    "build-artifact": 0,
    "headless-ui": 0,
    unclassified: 0,
  };
  for (const verdict of verdicts) {
    if (verdict.kind === "noise" && verdict.noiseClass) {
      noiseByClass[verdict.noiseClass] += 1;
    }
  }

  const colorMatches = serialized.match(COLOR_LITERAL) ?? [];
  const distinctColors = new Set(colorMatches.map((c) => c.toLowerCase().replace(/\s+/g, ""))).size;

  const signalRatio = verdicts.length === 0 ? 0 : signals.length / verdicts.length;
  const colorConvergence = convergenceScore(distinctColors);

  const totalLeaves = countLeaves(extraction);
  const redundancy = verdicts.length === 0 ? 0 : totalLeaves / verdicts.length;
  const bytesPerSignal = signals.length === 0 ? Number.POSITIVE_INFINITY : payloadBytes / signals.length;
  const density = densityScore(bytesPerSignal);

  const topNoise = verdicts
    .filter((v) => v.kind === "noise")
    .slice(0, 15);

  return {
    signalRatio,
    distinctColors,
    colorConvergence,
    payloadBytes,
    totalNames: verdicts.length,
    signalNames: signals.length,
    totalLeaves,
    redundancy: Number(redundancy.toFixed(1)),
    bytesPerSignal: Number.isFinite(bytesPerSignal) ? Math.round(bytesPerSignal) : -1,
    density: Number(density.toFixed(3)),
    noiseByClass,
    topNoise,
    // Density carries the most weight: an accurate but unconsumable payload is
    // still a failed extraction.
    score: Number((density * 0.5 + signalRatio * 0.3 + colorConvergence * 0.2).toFixed(3)),
  };
}
