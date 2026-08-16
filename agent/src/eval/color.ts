/**
 * Colour science primitives shared by the L2 and L4 scorers.
 *
 * Everything here is deliberately deterministic and dependency-free. Colour
 * comparison is the one place where an eval can quietly cheat: comparing hex
 * strings, or Euclidean distance in sRGB, produces numbers that look rigorous
 * while disagreeing with human perception. CIEDE2000 is the CIE's own
 * recommendation for perceptual difference and is what the rest of the
 * pipeline measures against.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const D65 = { x: 95.047, y: 100.0, z: 108.883 } as const;

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pivotXyz(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbChannelToLinear(rgb.r) * 100;
  const g = srgbChannelToLinear(rgb.g) * 100;
  const b = srgbChannelToLinear(rgb.b) * 100;

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / D65.x;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / D65.y;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / D65.z;

  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deg = (rad: number): number => (rad * 180) / Math.PI;
const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * CIEDE2000 colour difference (CIE 142-2001).
 *
 * Implemented from the standard formulation with kL = kC = kH = 1. Verified
 * against the Sharma-Wu-Dalal reference pairs in color.test.ts; those cases
 * exist specifically because the hue-rotation term is easy to get subtly wrong
 * in a way that only shows up on blue/purple pairs.
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) / 2;

  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));

  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;

  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);

  const h1p = c1p === 0 ? 0 : (deg(Math.atan2(lab1.b, a1p)) + 360) % 360;
  const h2p = c2p === 0 ? 0 : (deg(Math.atan2(lab2.b, a2p)) + 360) % 360;

  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;

  let dhp: number;
  if (c1p * c2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp) / 2);

  const lBarP = (lab1.l + lab2.l) / 2;
  const cBarP = (c1p + c2p) / 2;

  let hBarP: number;
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hBarP = (h1p + h2p + 360) / 2;
  } else {
    hBarP = (h1p + h2p - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63));

  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const rt = -Math.sin(rad(2 * dTheta)) * rc;

  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;

  const termL = dLp / sl;
  const termC = dCp / sc;
  const termH = dHp / sh;

  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + rt * termC * termH);
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return ciede2000(rgbToLab(a), rgbToLab(b));
}

/**
 * A CIEDE2000 delta of ~2.3 is the "just noticeable difference" threshold.
 * Anything past ~25 reads as an unmistakably different colour, so that is used
 * as the saturation point when converting a distance into a 0..1 score.
 */
export const JND = 2.3;
const MAX_MEANINGFUL_DELTA = 25;

export function deltaToScore(delta: number): number {
  if (delta <= JND) return 1;
  if (delta >= MAX_MEANINGFUL_DELTA) return 0;
  return 1 - (delta - JND) / (MAX_MEANINGFUL_DELTA - JND);
}

export interface WeightedColor {
  readonly color: Rgb;
  /** Relative importance; the set is normalised internally. */
  readonly weight: number;
}

/**
 * Earth Mover's Distance between two weighted palettes, using CIEDE2000 as the
 * ground metric.
 *
 * Comparing palettes by set intersection is the obvious approach and the wrong
 * one: it treats "#0d0d0d vs #0f0f0f" as a total miss while treating a missing
 * accent colour the same as a missing near-duplicate. EMD instead asks what it
 * costs to reshape one distribution into the other, so near-misses cost little
 * and dominant-colour errors cost a lot. Rubner et al. established this as a
 * good match for perceptual image similarity.
 *
 * Solved greedily (cheapest remaining pair first). For palettes of a dozen
 * entries the greedy transport is within a few percent of the LP optimum and
 * stays monotone -- more similar palettes always score higher -- which is all a
 * comparative metric needs.
 */
export function paletteEmd(
  source: readonly WeightedColor[],
  target: readonly WeightedColor[],
): number {
  if (source.length === 0 || target.length === 0) return MAX_MEANINGFUL_DELTA;

  const normalise = (items: readonly WeightedColor[]): { color: Rgb; w: number }[] => {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (total <= 0) {
      return items.map((item) => ({ color: item.color, w: 1 / items.length }));
    }
    return items.map((item) => ({ color: item.color, w: Math.max(0, item.weight) / total }));
  };

  const supply = normalise(source);
  const demand = normalise(target);

  const pairs: { i: number; j: number; cost: number }[] = [];
  for (let i = 0; i < supply.length; i += 1) {
    for (let j = 0; j < demand.length; j += 1) {
      const from = supply[i];
      const to = demand[j];
      if (!from || !to) continue;
      pairs.push({ i, j, cost: colorDistance(from.color, to.color) });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);

  const remainingSupply = supply.map((s) => s.w);
  const remainingDemand = demand.map((d) => d.w);
  let moved = 0;
  let totalCost = 0;

  for (const pair of pairs) {
    const available = remainingSupply[pair.i] ?? 0;
    const needed = remainingDemand[pair.j] ?? 0;
    const flow = Math.min(available, needed);
    if (flow <= 1e-9) continue;
    remainingSupply[pair.i] = available - flow;
    remainingDemand[pair.j] = needed - flow;
    totalCost += flow * pair.cost;
    moved += flow;
  }

  return moved <= 0 ? MAX_MEANINGFUL_DELTA : totalCost / moved;
}

export function paletteSimilarity(
  source: readonly WeightedColor[],
  target: readonly WeightedColor[],
): number {
  return deltaToScore(paletteEmd(source, target));
}

/**
 * Directional, truth-weighted palette coverage.
 *
 * Answers a different question than EMD: "did the extraction capture the
 * colours that actually matter?" For each ground-truth colour, find the
 * nearest claimed colour and score that match, weighted by how much of the
 * page the truth colour paints.
 *
 * This is the correct question for L2 because the claim side carries no area
 * information -- an extractor lists colours without saying how much of the
 * page each one covers. Scoring an unweighted claim set against a weighted
 * truth distribution with EMD penalises the extractor for a weight it never
 * emitted, which shows up as a flat zero even when every important colour was
 * found. Over-collection is a real defect, but it is a usability problem and
 * is already priced into L3; charging for it again here would double-count.
 *
 * EMD remains the right tool once both sides carry weights, which is the case
 * when comparing a re-render against the original page.
 */
export function paletteCoverage(
  truth: readonly WeightedColor[],
  claimed: readonly Rgb[],
): number {
  if (truth.length === 0 || claimed.length === 0) return 0;

  const totalWeight = truth.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return 0;

  let score = 0;
  for (const entry of truth) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidate of claimed) {
      const distance = colorDistance(entry.color, candidate);
      if (distance < nearest) nearest = distance;
      if (nearest <= JND) break;
    }
    score += (Math.max(0, entry.weight) / totalWeight) * deltaToScore(nearest);
  }
  return score;
}

/**
 * How many claimed colours actually appear on the page.
 *
 * The mirror of paletteCoverage, and the reason coverage alone must never be
 * reported as "accuracy": an extractor that emits every colour it can find
 * covers the reference set by brute force and scores perfectly. Precision asks
 * the opposite question -- of the values reported, how many were really
 * painted?
 *
 * A low score here has a concrete meaning: the extractor pulled colours out of
 * stylesheets that never rendered (inactive rules, hidden components, unused
 * third-party themes) and presented them as part of the design.
 *
 * Scored against the untruncated reference set, so a real but minor colour is
 * not counted as invented merely for falling outside the top ranks.
 */
export function paletteReality(
  claimed: readonly Rgb[],
  reference: readonly Rgb[],
): number {
  if (claimed.length === 0 || reference.length === 0) return 0;

  let matched = 0;
  for (const candidate of claimed) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const actual of reference) {
      const distance = colorDistance(candidate, actual);
      if (distance < nearest) nearest = distance;
      if (nearest <= JND) break;
    }
    matched += deltaToScore(nearest);
  }
  return matched / claimed.length;
}

/** Harmonic mean, so a system cannot win by maximising one side alone. */
export function harmonicMean(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}
