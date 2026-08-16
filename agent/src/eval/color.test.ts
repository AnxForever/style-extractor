import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ciede2000,
  colorDistance,
  deltaToScore,
  harmonicMean,
  paletteCoverage,
  paletteEmd,
  paletteReality,
  paletteSimilarity,
  rgbToLab,
  type Lab,
} from "./color.js";

/**
 * Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-
 * Difference Formula: Implementation Notes, Supplementary Test Data and
 * Mathematical Observations".
 *
 * These specific pairs are the ones that break naive implementations: the
 * blue/purple cases exercise the RT hue-rotation term, and the near-neutral
 * cases exercise the arithmetic-mean-hue discontinuity at 0/360 degrees. An
 * implementation that skips either still scores well on grey ramps, which is
 * why "it looked right on my test colours" is not evidence.
 */
const REFERENCE: readonly { a: Lab; b: Lab; expected: number }[] = [
  { a: { l: 50, a: 2.6772, b: -79.7751 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 2.0425 },
  { a: { l: 50, a: 3.1571, b: -77.2803 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 2.8615 },
  { a: { l: 50, a: 2.8361, b: -74.02 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 3.4412 },
  { a: { l: 50, a: -1.3802, b: -84.2814 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 1.0 },
  { a: { l: 50, a: -1.1848, b: -84.8006 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 1.0 },
  { a: { l: 50, a: -0.9009, b: -85.5211 }, b: { l: 50, a: 0, b: -82.7485 }, expected: 1.0 },
  { a: { l: 50, a: 0, b: 0 }, b: { l: 50, a: -1, b: 2 }, expected: 2.3669 },
  { a: { l: 50, a: 2.49, b: -0.001 }, b: { l: 50, a: -2.49, b: 0.0009 }, expected: 7.1792 },
  { a: { l: 60.2574, a: -34.0099, b: 36.2677 }, b: { l: 60.4626, a: -34.1751, b: 39.4387 }, expected: 1.2644 },
  { a: { l: 63.0109, a: -31.0961, b: -5.8663 }, b: { l: 62.8187, a: -29.7946, b: -4.0864 }, expected: 1.263 },
  { a: { l: 22.7233, a: 20.0904, b: -46.694 }, b: { l: 23.0331, a: 14.973, b: -42.5619 }, expected: 2.0373 },
  { a: { l: 2.0776, a: 0.0795, b: -1.135 }, b: { l: 0.9033, a: -0.0636, b: -0.5514 }, expected: 0.9082 },
];

test("ciede2000 matches Sharma-Wu-Dalal reference data", () => {
  for (const { a, b, expected } of REFERENCE) {
    const actual = ciede2000(a, b);
    assert.ok(
      Math.abs(actual - expected) < 0.0001,
      `expected ${expected}, got ${actual.toFixed(4)} for ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
    );
  }
});

test("ciede2000 is symmetric", () => {
  for (const { a, b } of REFERENCE) {
    assert.ok(Math.abs(ciede2000(a, b) - ciede2000(b, a)) < 1e-9);
  }
});

test("identical colours have zero distance", () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  assert.equal(colorDistance(white, white), 0);
  assert.equal(deltaToScore(0), 1);
});

test("rgbToLab anchors on known sRGB values", () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255, a: 1 });
  assert.ok(Math.abs(white.l - 100) < 0.05, `white L* was ${white.l}`);
  assert.ok(Math.abs(white.a) < 0.05 && Math.abs(white.b) < 0.05);

  const black = rgbToLab({ r: 0, g: 0, b: 0, a: 1 });
  assert.ok(Math.abs(black.l) < 0.05, `black L* was ${black.l}`);
});

test("palette EMD rewards near-misses over structural misses", () => {
  const truth = [
    { color: { r: 13, g: 13, b: 13, a: 1 }, weight: 0.7 },
    { color: { r: 59, g: 130, b: 246, a: 1 }, weight: 0.3 },
  ];
  // Same structure, imperceptibly different values.
  const nearMiss = [
    { color: { r: 15, g: 15, b: 15, a: 1 }, weight: 0.7 },
    { color: { r: 60, g: 132, b: 248, a: 1 }, weight: 0.3 },
  ];
  // Right accent, but the dominant colour is inverted.
  const dominantWrong = [
    { color: { r: 245, g: 245, b: 245, a: 1 }, weight: 0.7 },
    { color: { r: 59, g: 130, b: 246, a: 1 }, weight: 0.3 },
  ];

  const near = paletteEmd(truth, nearMiss);
  const wrong = paletteEmd(truth, dominantWrong);

  assert.ok(near < 2.5, `near-miss should be under JND-ish, got ${near.toFixed(2)}`);
  assert.ok(wrong > near * 5, `dominant error should dwarf near-miss: ${wrong.toFixed(2)} vs ${near.toFixed(2)}`);
  assert.ok(paletteSimilarity(truth, nearMiss) > paletteSimilarity(truth, dominantWrong));
});

test("palette EMD weights by area share, not by count", () => {
  const truth = [
    { color: { r: 0, g: 0, b: 0, a: 1 }, weight: 0.95 },
    { color: { r: 255, g: 0, b: 0, a: 1 }, weight: 0.05 },
  ];
  // Misses only the tiny accent.
  const missAccent = [
    { color: { r: 0, g: 0, b: 0, a: 1 }, weight: 0.95 },
    { color: { r: 0, g: 200, b: 0, a: 1 }, weight: 0.05 },
  ];
  // Misses only the dominant surface.
  const missSurface = [
    { color: { r: 255, g: 255, b: 255, a: 1 }, weight: 0.95 },
    { color: { r: 255, g: 0, b: 0, a: 1 }, weight: 0.05 },
  ];

  assert.ok(
    paletteEmd(truth, missAccent) < paletteEmd(truth, missSurface),
    "missing a 5% accent must cost less than missing the 95% surface",
  );
});

test("empty palettes degrade instead of throwing", () => {
  assert.ok(paletteEmd([], [{ color: { r: 0, g: 0, b: 0, a: 1 }, weight: 1 }]) > 0);
  assert.equal(paletteSimilarity([], []), 0);
  assert.equal(paletteCoverage([], [{ r: 0, g: 0, b: 0, a: 1 }]), 0);
  assert.equal(paletteCoverage([{ color: { r: 0, g: 0, b: 0, a: 1 }, weight: 1 }], []), 0);
});

const SURFACE = { r: 3, g: 7, b: 18, a: 1 };
const ACCENT = { r: 0, g: 167, b: 244, a: 1 };
const TRUTH = [
  { color: SURFACE, weight: 0.9 },
  { color: ACCENT, weight: 0.1 },
];

test("palette coverage rewards finding the colours that matter", () => {
  const found = paletteCoverage(TRUTH, [SURFACE, ACCENT]);
  assert.ok(found > 0.99, `full coverage should score ~1, got ${found.toFixed(3)}`);
});

test("palette coverage is not punished by over-collection", () => {
  // The defining property: an extractor that finds every real colour but also
  // dumps 40 irrelevant ones is accurate. Its verbosity is an L3 concern, and
  // charging for it here would double-count the same defect.
  const noise = Array.from({ length: 40 }, (_, i) => ({
    r: (i * 37) % 256,
    g: (i * 53) % 256,
    b: (i * 71) % 256,
    a: 1,
  }));
  const clean = paletteCoverage(TRUTH, [SURFACE, ACCENT]);
  const noisy = paletteCoverage(TRUTH, [SURFACE, ACCENT, ...noise]);
  assert.ok(
    Math.abs(clean - noisy) < 1e-9,
    `over-collection must not change accuracy: ${clean.toFixed(3)} vs ${noisy.toFixed(3)}`,
  );
});

test("palette coverage penalises by area share, not by colour count", () => {
  // Missing the 90% surface must hurt far more than missing the 10% accent.
  const missedSurface = paletteCoverage(TRUTH, [ACCENT]);
  const missedAccent = paletteCoverage(TRUTH, [SURFACE]);
  assert.ok(
    missedAccent > missedSurface,
    `missing the accent (${missedAccent.toFixed(3)}) should beat missing the surface (${missedSurface.toFixed(3)})`,
  );
  assert.ok(missedAccent > 0.85, `keeping the dominant surface should stay high: ${missedAccent.toFixed(3)}`);
  assert.ok(missedSurface < 0.2, `losing the dominant surface should collapse: ${missedSurface.toFixed(3)}`);
});

test("palette coverage treats imperceptible differences as matches", () => {
  const nudged = { r: SURFACE.r + 1, g: SURFACE.g + 1, b: SURFACE.b + 1, a: 1 };
  assert.ok(paletteCoverage([{ color: SURFACE, weight: 1 }], [nudged]) > 0.99);
});

test("palette reality catches colours that were never painted", () => {
  const painted = [SURFACE, ACCENT];
  const invented = [
    { r: 255, g: 0, b: 255, a: 1 },
    { r: 0, g: 255, b: 0, a: 1 },
    { r: 255, g: 200, b: 0, a: 1 },
  ];

  assert.ok(paletteReality(painted, painted) > 0.99, "reporting only real colours is precise");
  assert.ok(
    paletteReality([...painted, ...invented], painted) < 0.6,
    "padding the claim with unpainted colours must cost precision",
  );
  assert.ok(paletteReality(invented, painted) < 0.2, "an entirely invented claim is imprecise");
});

test("F1 closes the brute-force loophole that recall alone leaves open", () => {
  // The failure this guards against: an extractor that dumps every colour it
  // can find covers the reference set by sheer volume and scores a perfect
  // recall, which reads as "highly accurate" in a report. Reality must drag
  // the combined score down so that behaviour cannot look like precision.
  const truth = [
    { color: SURFACE, weight: 0.9 },
    { color: ACCENT, weight: 0.1 },
  ];
  const painted = [SURFACE, ACCENT];

  const dumpEverything = [
    SURFACE,
    ACCENT,
    ...Array.from({ length: 60 }, (_, i) => ({
      r: (i * 41) % 256,
      g: (i * 97) % 256,
      b: (i * 13) % 256,
      a: 1,
    })),
  ];

  const bruteRecall = paletteCoverage(truth, dumpEverything);
  const bruteReality = paletteReality(dumpEverything, painted);
  const bruteF1 = harmonicMean(bruteRecall, bruteReality);

  const preciseF1 = harmonicMean(
    paletteCoverage(truth, painted),
    paletteReality(painted, painted),
  );

  assert.ok(bruteRecall > 0.95, `brute force does win on recall alone: ${bruteRecall.toFixed(3)}`);
  assert.ok(
    bruteF1 < 0.5,
    `but the combined score must reject it: ${bruteF1.toFixed(3)}`,
  );
  assert.ok(
    preciseF1 > bruteF1 * 1.8,
    `a precise extraction must clearly beat a dump: ${preciseF1.toFixed(3)} vs ${bruteF1.toFixed(3)}`,
  );
});

test("harmonic mean refuses to reward a single strong side", () => {
  assert.equal(harmonicMean(1, 0), 0);
  assert.equal(harmonicMean(0, 1), 0);
  assert.ok(harmonicMean(1, 0.1) < 0.2, "one perfect side cannot carry a weak one");
  assert.ok(Math.abs(harmonicMean(0.8, 0.8) - 0.8) < 1e-9);
});
