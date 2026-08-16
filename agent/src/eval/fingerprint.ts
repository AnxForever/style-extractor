import { rgbToLab, type Rgb, type WeightedColor } from "./color.js";

/**
 * L4: does it read as the same design?
 *
 * L2 asks whether individual values are right. A palette can pass L2 and still
 * produce something that looks nothing like the original, because visual
 * character lives in the *distribution* of values rather than in any single
 * one: how much of the page is dark, how saturated it gets, whether the hues
 * cluster into one family or scatter. Those are the properties a person reads
 * as "the same design", and they are what "the values are right but it doesn't
 * look like it" actually refers to.
 *
 * A fingerprint captures that shape. Comparing two fingerprints is a
 * distribution problem where both sides carry weights, which is exactly the
 * case Earth Mover's Distance was built for -- and in one dimension EMD has a
 * closed form (the L1 distance between CDFs), so this stays exact rather than
 * approximate.
 */

const LIGHTNESS_BINS = 10;
const CHROMA_BINS = 8;
const HUE_BINS = 12;

export interface StyleFingerprint {
  /** Area-weighted L* distribution, 10 bins spanning 0..100. */
  readonly lightness: readonly number[];
  /** Area-weighted C* (chroma) distribution, 8 bins spanning 0..128. */
  readonly chroma: readonly number[];
  /**
   * Normalised entropy of the hue distribution, 0..1.
   * Near 0 means a single hue family (monochrome, brand-locked); near 1 means
   * hues spread evenly, which reads as playful or unfocused.
   */
  readonly hueEntropy: number;
  /** Weighted mean L*. Separates dark-first designs from light-first ones. */
  readonly meanLightness: number;
  /** Weighted mean C*. Separates muted systems from vivid ones. */
  readonly meanChroma: number;
}

function emptyBins(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

export function fingerprint(palette: readonly WeightedColor[]): StyleFingerprint {
  const lightness = emptyBins(LIGHTNESS_BINS);
  const chroma = emptyBins(CHROMA_BINS);
  const hue = emptyBins(HUE_BINS);

  let totalWeight = 0;
  let lightnessSum = 0;
  let chromaSum = 0;
  let chromaticWeight = 0;

  for (const entry of palette) {
    const weight = Math.max(0, entry.weight);
    if (weight <= 0) continue;
    totalWeight += weight;

    const lab = rgbToLab(entry.color);
    const c = Math.hypot(lab.a, lab.b);

    const lIndex = Math.min(LIGHTNESS_BINS - 1, Math.max(0, Math.floor((lab.l / 100) * LIGHTNESS_BINS)));
    lightness[lIndex] = (lightness[lIndex] ?? 0) + weight;

    const cIndex = Math.min(CHROMA_BINS - 1, Math.max(0, Math.floor((c / 128) * CHROMA_BINS)));
    chroma[cIndex] = (chroma[cIndex] ?? 0) + weight;

    lightnessSum += lab.l * weight;
    chromaSum += c * weight;

    // Near-neutral colours have unstable hue angles; letting greys vote would
    // make every monochrome palette look hue-diverse.
    if (c > 5) {
      const angle = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
      const normalized = (angle + 360) % 360;
      const hIndex = Math.min(HUE_BINS - 1, Math.floor((normalized / 360) * HUE_BINS));
      hue[hIndex] = (hue[hIndex] ?? 0) + weight;
      chromaticWeight += weight;
    }
  }

  if (totalWeight <= 0) {
    return {
      lightness: emptyBins(LIGHTNESS_BINS),
      chroma: emptyBins(CHROMA_BINS),
      hueEntropy: 0,
      meanLightness: 0,
      meanChroma: 0,
    };
  }

  let entropy = 0;
  if (chromaticWeight > 0) {
    for (const bucket of hue) {
      const p = bucket / chromaticWeight;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    entropy /= Math.log2(HUE_BINS);
  }

  return {
    lightness: lightness.map((v) => v / totalWeight),
    chroma: chroma.map((v) => v / totalWeight),
    hueEntropy: entropy,
    meanLightness: lightnessSum / totalWeight,
    meanChroma: chromaSum / totalWeight,
  };
}

/**
 * Exact 1-D Earth Mover's Distance between two normalised histograms.
 *
 * In one dimension the optimal transport plan is the difference of cumulative
 * distributions, so no LP solver is needed. Result is normalised to 0..1 by
 * the maximum possible displacement.
 */
export function histogramEmd(a: readonly number[], b: readonly number[]): number {
  const bins = Math.min(a.length, b.length);
  if (bins <= 1) return 0;

  const sumA = a.reduce((sum, v) => sum + v, 0);
  const sumB = b.reduce((sum, v) => sum + v, 0);
  if (sumA <= 0 || sumB <= 0) return 1;

  let cumulativeA = 0;
  let cumulativeB = 0;
  let work = 0;
  for (let i = 0; i < bins; i += 1) {
    cumulativeA += (a[i] ?? 0) / sumA;
    cumulativeB += (b[i] ?? 0) / sumB;
    work += Math.abs(cumulativeA - cumulativeB);
  }
  // Worst case moves all mass across every bin boundary.
  return Math.min(1, work / (bins - 1));
}

export interface FingerprintComparison {
  readonly lightnessSimilarity: number;
  readonly chromaSimilarity: number;
  readonly hueCharacterSimilarity: number;
  readonly toneMatch: number;
  /** Combined 0..1. */
  readonly score: number;
}

export function compareFingerprints(
  truth: StyleFingerprint,
  candidate: StyleFingerprint,
): FingerprintComparison {
  const lightnessSimilarity = 1 - histogramEmd(truth.lightness, candidate.lightness);
  const chromaSimilarity = 1 - histogramEmd(truth.chroma, candidate.chroma);
  const hueCharacterSimilarity = 1 - Math.abs(truth.hueEntropy - candidate.hueEntropy);

  // Getting dark-vs-light wrong is the single most visible failure; a 40-point
  // L* gap is treated as a total miss.
  const toneMatch = Math.max(0, 1 - Math.abs(truth.meanLightness - candidate.meanLightness) / 40);

  const score =
    lightnessSimilarity * 0.35 +
    toneMatch * 0.3 +
    chromaSimilarity * 0.2 +
    hueCharacterSimilarity * 0.15;

  return {
    lightnessSimilarity: Number(lightnessSimilarity.toFixed(3)),
    chromaSimilarity: Number(chromaSimilarity.toFixed(3)),
    hueCharacterSimilarity: Number(hueCharacterSimilarity.toFixed(3)),
    toneMatch: Number(toneMatch.toFixed(3)),
    score: Number(score.toFixed(3)),
  };
}

/**
 * Build a fingerprint from colours that carry no weight information.
 *
 * An extractor emits a list of colours without saying how much of the page
 * each covers, so the reconstruction has to assume uniform weighting. That
 * assumption is itself the finding: a palette that is correct as a *set* but
 * silent about proportion cannot reproduce the original's visual balance,
 * which is precisely why extracted values can all be right while the result
 * looks wrong.
 */
export function fingerprintFromUnweighted(colors: readonly Rgb[]): StyleFingerprint {
  return fingerprint(colors.map((color) => ({ color, weight: 1 })));
}
