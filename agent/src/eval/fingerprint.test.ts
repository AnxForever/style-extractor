import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compareFingerprints,
  fingerprint,
  fingerprintFromUnweighted,
  histogramEmd,
} from "./fingerprint.js";
import type { Rgb, WeightedColor } from "./color.js";

const NEAR_BLACK: Rgb = { r: 3, g: 7, b: 18, a: 1 };
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const BLUE: Rgb = { r: 0, g: 167, b: 244, a: 1 };
const RED: Rgb = { r: 244, g: 63, b: 94, a: 1 };
const GREEN: Rgb = { r: 34, g: 197, b: 94, a: 1 };

/** A dark-first design: mostly near-black surface with a small accent. */
const DARK_SITE: WeightedColor[] = [
  { color: NEAR_BLACK, weight: 0.9 },
  { color: BLUE, weight: 0.1 },
];

/** The same colours, inverted proportions: a light-first design. */
const LIGHT_SITE: WeightedColor[] = [
  { color: WHITE, weight: 0.9 },
  { color: BLUE, weight: 0.1 },
];

test("histogram EMD is zero for identical distributions", () => {
  assert.equal(histogramEmd([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(histogramEmd([0.5, 0.5], [5, 5]), 0, "scale-invariant after normalisation");
});

test("histogram EMD grows with displacement", () => {
  const near = histogramEmd([1, 0, 0, 0], [0, 1, 0, 0]);
  const far = histogramEmd([1, 0, 0, 0], [0, 0, 0, 1]);
  assert.ok(far > near, `moving mass further must cost more: ${far} vs ${near}`);
  assert.ok(far <= 1 && near >= 0, "stays normalised to 0..1");
});

test("histogram EMD degrades safely on empty input", () => {
  assert.equal(histogramEmd([], []), 0);
  assert.equal(histogramEmd([0, 0], [1, 1]), 1);
});

test("fingerprint separates dark-first from light-first designs", () => {
  const dark = fingerprint(DARK_SITE);
  const light = fingerprint(LIGHT_SITE);

  assert.ok(dark.meanLightness < 30, `dark site mean L* was ${dark.meanLightness.toFixed(1)}`);
  assert.ok(light.meanLightness > 80, `light site mean L* was ${light.meanLightness.toFixed(1)}`);

  const comparison = compareFingerprints(dark, light);
  assert.equal(comparison.toneMatch, 0, "a full tonal inversion must score zero on tone");
  assert.ok(comparison.score < 0.4, `overall should be low, got ${comparison.score}`);
});

test("fingerprint matches itself", () => {
  const self = compareFingerprints(fingerprint(DARK_SITE), fingerprint(DARK_SITE));
  assert.ok(self.score > 0.99, `identical fingerprints should score ~1, got ${self.score}`);
});

test("hue entropy separates monochrome from multi-hue palettes", () => {
  const mono = fingerprint([
    { color: BLUE, weight: 1 },
    { color: { r: 0, g: 120, b: 180, a: 1 }, weight: 1 },
  ]);
  const varied = fingerprint([
    { color: BLUE, weight: 1 },
    { color: RED, weight: 1 },
    { color: GREEN, weight: 1 },
  ]);
  assert.ok(
    varied.hueEntropy > mono.hueEntropy,
    `multi-hue (${varied.hueEntropy.toFixed(2)}) should exceed mono (${mono.hueEntropy.toFixed(2)})`,
  );
});

test("near-neutral colours do not vote on hue", () => {
  // Greys have numerically unstable hue angles. Letting them count would make
  // every monochrome palette register as hue-diverse.
  const greys = fingerprint([
    { color: { r: 10, g: 10, b: 10, a: 1 }, weight: 1 },
    { color: { r: 128, g: 128, b: 128, a: 1 }, weight: 1 },
    { color: { r: 240, g: 240, b: 240, a: 1 }, weight: 1 },
  ]);
  assert.equal(greys.hueEntropy, 0, "a pure greyscale palette has no hue character");
});

test("unweighted reconstruction loses the original visual balance", () => {
  // The headline L4 finding: an extractor that reports colours without area
  // information cannot reproduce a design's tonal balance, even when every
  // individual colour it reports is correct.
  const truth = fingerprint(DARK_SITE);
  const rebuilt = fingerprintFromUnweighted([NEAR_BLACK, BLUE]);

  assert.ok(
    rebuilt.meanLightness > truth.meanLightness + 15,
    `flattening weights should lift mean lightness: ${truth.meanLightness.toFixed(1)} -> ${rebuilt.meanLightness.toFixed(1)}`,
  );
  assert.ok(
    compareFingerprints(truth, rebuilt).score < 0.9,
    "a correct colour set with no weights should not read as a perfect match",
  );
});

test("empty palette produces a defined, neutral fingerprint", () => {
  const empty = fingerprint([]);
  assert.equal(empty.hueEntropy, 0);
  assert.equal(empty.meanLightness, 0);
  assert.equal(empty.lightness.length, 10);
  assert.ok(empty.lightness.every((v) => v === 0));
});
