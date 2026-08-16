import type { Page } from "playwright";

import {
  colorDistance,
  deltaToScore,
  harmonicMean,
  paletteCoverage,
  paletteReality,
  type Rgb,
  type WeightedColor,
} from "./color.js";
import { normalizeColors, type GroundTruth } from "./ground-truth.js";
import {
  compareFingerprints,
  fingerprint,
  fingerprintFromUnweighted,
  type FingerprintComparison,
} from "./fingerprint.js";

/**
 * L2: are the extracted values actually right?
 *
 * Scored against ground truth collected by ground-truth.ts, which shares no
 * code with the extraction engine. Every comparison runs through CIEDE2000 so
 * "#0d0d0d vs #0f0f0f" counts as correct while a genuinely different colour
 * does not, regardless of which notation either side used.
 */

/** Values the extractor asserts about the page, gathered without assuming its schema. */
export interface ExtractedClaims {
  readonly themeSurfaces: {
    readonly light: { background?: string; foreground?: string };
    readonly dark: { background?: string; foreground?: string };
  };
  readonly fontFamilies: readonly string[];
  readonly colorLiterals: readonly string[];
}

export type ThemeVerdict =
  /** Extractor reported genuinely different values per theme, matching reality. */
  | "correct"
  /** Ground truth differs between themes but the extractor reported one value twice. */
  | "collapsed"
  /** Ground truth itself does not change; nothing to get right. */
  | "single-theme"
  /** Extractor produced no per-theme data at all. */
  | "absent";

export interface AccuracyReport {
  readonly surfaceBackground: number;
  readonly surfaceForeground: number;
  /** Were the colours that dominate the page found? Weighted by painted area. */
  readonly paletteRecall: number;
  /** Of the colours claimed, how many are actually painted on the page? */
  readonly paletteReality: number;
  /** Harmonic mean of recall and reality. Reported instead of either alone. */
  readonly paletteFidelity: number;
  readonly claimedColorCount: number;
  readonly fontAccuracy: number;
  readonly fontDetail: {
    readonly expected: readonly string[];
    readonly claimed: readonly string[];
    readonly fallbackOnly: boolean;
  };
  readonly themeSwitching: ThemeVerdict;
  /**
   * Extracted colours resolved to RGB, reused downstream so the agent stage
   * does not have to reopen a browser purely to parse colour notation.
   */
  readonly resolvedColors: readonly Rgb[];
  /**
   * L4: does the reconstructed palette read as the same design?
   *
   * Separate from the accuracy score on purpose. A payload can score well on
   * every value above and still fail here, because visual character lives in
   * the distribution of colour rather than in the individual entries -- which
   * is what "the values are right but it doesn't look like it" describes.
   */
  readonly perception: FingerprintComparison;
  readonly score: number;
}

const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|oklab|lch|oklch)\([^)]*\)/gi;

/**
 * Generic font stacks a browser can satisfy without downloading anything.
 * Seeing only these when the page renders a webfont is the signature of
 * sampling before document.fonts.ready resolved.
 */
const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "roboto",
  "arial",
  "helvetica",
  "helvetica neue",
  "times new roman",
]);

function isGeneric(family: string): boolean {
  return GENERIC_FAMILIES.has(family.trim().toLowerCase().replace(/^["']|["']$/g, ""));
}

/**
 * Walk the payload collecting claims by key name and path, rather than by a
 * fixed schema. The extractor's output shape has changed across its versions
 * and differs per preset; binding the judge to one shape would silently score
 * zero the next time the layout moves.
 */
export function readClaims(extraction: unknown): ExtractedClaims {
  const themeSurfaces = {
    light: {} as { background?: string; foreground?: string },
    dark: {} as { background?: string; foreground?: string },
  };
  const fontFamilies = new Set<string>();

  const visit = (node: unknown, path: string[], depth: number): void => {
    if (depth > 14 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, path, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const nextPath = [...path, lowerKey];

      if (typeof value === "string" && value.trim()) {
        if (lowerKey.includes("fontfamily") || lowerKey === "font-family") {
          const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
          if (first) fontFamilies.add(first);
        }

        const inLight = nextPath.some((p) => p === "light");
        const inDark = nextPath.some((p) => p === "dark");
        const isBg = lowerKey.includes("backgroundcolor") || lowerKey === "background";
        const isFg = lowerKey === "color" || lowerKey.includes("textcolor");

        if (inLight !== inDark) {
          const bucket = inLight ? themeSurfaces.light : themeSurfaces.dark;
          // Keep the first hit: shallower paths are closer to the page-level
          // surface than deeply nested component values.
          if (isBg && bucket.background === undefined) bucket.background = value;
          if (isFg && bucket.foreground === undefined) bucket.foreground = value;
        }
      }

      visit(value, nextPath, depth + 1);
    }
  };

  visit(extraction, [], 0);

  const serialized = JSON.stringify(extraction ?? null) ?? "";
  const colorLiterals = [
    ...new Set((serialized.match(COLOR_LITERAL) ?? []).map((c) => c.replace(/\\"/g, ""))),
  ].slice(0, 400);

  return { themeSurfaces, fontFamilies: [...fontFamilies], colorLiterals };
}

function scoreColorClaim(claim: Rgb | null | undefined, truth: Rgb): number {
  if (!claim) return 0;
  // A fully transparent claim carries no information about what a user sees;
  // this is the body-is-transparent failure, and it must not score as a match
  // just because the numeric channels happen to be near the truth.
  if (claim.a < 0.05 && truth.a >= 0.05) return 0;
  return deltaToScore(colorDistance(claim, truth));
}

export async function scoreAccuracy(
  page: Page,
  extraction: unknown,
  truth: { readonly light: GroundTruth; readonly dark: GroundTruth },
): Promise<AccuracyReport> {
  const claims = readClaims(extraction);

  // One batched round trip normalises every string the browser can parse.
  const toResolve = [
    claims.themeSurfaces.light.background,
    claims.themeSurfaces.light.foreground,
    claims.themeSurfaces.dark.background,
    claims.themeSurfaces.dark.foreground,
    ...claims.colorLiterals,
  ];
  const resolved = await normalizeColors(
    page,
    toResolve.map((value) => value ?? ""),
  );

  const lightBg = resolved[0];
  const lightFg = resolved[1];
  const darkBg = resolved[2];
  const darkFg = resolved[3];
  const paletteClaim = resolved.slice(4).filter((c): c is Rgb => c !== null && c.a >= 0.05);

  // -- theme switching diagnosis -------------------------------------------
  const truthDelta = colorDistance(truth.light.surface.background, truth.dark.surface.background);
  const truthChanges = truthDelta > 5;

  let themeSwitching: ThemeVerdict;
  if (!lightBg && !darkBg) {
    themeSwitching = "absent";
  } else if (!truthChanges) {
    themeSwitching = "single-theme";
  } else if (lightBg && darkBg && colorDistance(lightBg, darkBg) > 5) {
    themeSwitching = "correct";
  } else {
    themeSwitching = "collapsed";
  }

  // Grade surfaces against both themes and credit the better match: some
  // extractors emit one unlabelled surface, and guessing which theme it meant
  // would turn a labelling gap into a fabricated accuracy failure.
  const bgTruthLight = truth.light.surface.background;
  const bgTruthDark = truth.dark.surface.background;

  const surfaceBackground = Math.max(
    scoreColorClaim(lightBg, bgTruthLight),
    scoreColorClaim(darkBg, bgTruthDark),
    scoreColorClaim(lightBg, bgTruthDark),
    scoreColorClaim(darkBg, bgTruthLight),
  );
  const surfaceForeground = Math.max(
    scoreColorClaim(lightFg, truth.light.surface.foreground),
    scoreColorClaim(darkFg, truth.dark.surface.foreground),
    scoreColorClaim(lightFg, truth.dark.surface.foreground),
    scoreColorClaim(darkFg, truth.light.surface.foreground),
  );

  // -- palette --------------------------------------------------------------
  // Grade against whichever theme yields the richer truth sample; a site that
  // only ships one theme still gets a full-strength comparison.
  const richer = truth.dark.palette.length >= truth.light.palette.length ? truth.dark : truth.light;
  const truthPalette: WeightedColor[] = richer.palette.map((p) => ({
    color: p.color,
    weight: p.areaShare,
  }));
  // Union both themes for the reality check: a colour that only appears in the
  // theme not being graded is still a real colour, not an invention.
  const reference: Rgb[] = [...truth.light.allColors, ...truth.dark.allColors];

  const recall =
    truthPalette.length === 0 || paletteClaim.length === 0
      ? 0
      : paletteCoverage(truthPalette, paletteClaim);
  const reality =
    paletteClaim.length === 0 || reference.length === 0
      ? 0
      : paletteReality(paletteClaim, reference);
  const paletteFidelity = harmonicMean(recall, reality);

  // -- fonts ----------------------------------------------------------------
  const expected = truth.dark.typography.families.length > 0
    ? truth.dark.typography.families
    : truth.light.typography.families;
  const claimed = claims.fontFamilies;

  const normalise = (s: string): string => s.trim().toLowerCase().replace(/^["']|["']$/g, "");
  const claimedSet = new Set(claimed.map(normalise));
  const matched = expected.filter((family) => claimedSet.has(normalise(family)));
  const realExpected = expected.filter((family) => !isGeneric(family));
  const fallbackOnly =
    realExpected.length > 0 && claimed.length > 0 && claimed.every((family) => isGeneric(family));

  const fontAccuracy =
    expected.length === 0 ? 0 : fallbackOnly ? 0 : matched.length / expected.length;

  const score = Number(
    (
      surfaceBackground * 0.3 +
      surfaceForeground * 0.2 +
      paletteFidelity * 0.3 +
      fontAccuracy * 0.2
    ).toFixed(3),
  );

  const perception = compareFingerprints(
    fingerprint(truthPalette),
    fingerprintFromUnweighted(paletteClaim),
  );

  return {
    surfaceBackground: Number(surfaceBackground.toFixed(3)),
    surfaceForeground: Number(surfaceForeground.toFixed(3)),
    paletteRecall: Number(recall.toFixed(3)),
    paletteReality: Number(reality.toFixed(3)),
    paletteFidelity: Number(paletteFidelity.toFixed(3)),
    claimedColorCount: paletteClaim.length,
    fontAccuracy: Number(fontAccuracy.toFixed(3)),
    fontDetail: { expected, claimed, fallbackOnly },
    themeSwitching,
    resolvedColors: paletteClaim,
    perception,
    score,
  };
}
