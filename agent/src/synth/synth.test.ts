import { test } from "node:test";
import assert from "node:assert/strict";

import { generateSystem, systemTokens, toHex } from "./system.js";
import { renderPage, DIFFICULTIES } from "./page.js";
import { scoreAgainstSystem } from "./score.js";
import { colorDistance } from "../eval/color.js";
import type { DtcgGroup } from "../agent/tools.js";

const SYSTEM = generateSystem({ seed: 42, stepsPerFamily: 4, extraFamilies: 2 });

/** The proposal a perfect recovery would produce. */
function perfectProposal(system = SYSTEM): DtcgGroup {
  const color: DtcgGroup = {};
  for (const family of system.families) {
    if (family.steps.length === 1) {
      color[family.name] = { $value: toHex(family.steps[0]!), $type: "color" };
    } else {
      const group: DtcgGroup = {};
      family.steps.forEach((step, index) => {
        group[String(index + 1)] = { $value: toHex(step), $type: "color" };
      });
      color[family.name] = group;
    }
  }
  return { color };
}

test("the same seed always produces the same system", () => {
  // Without this a reported score cannot be reproduced, which would make the
  // whole benchmark unfalsifiable.
  const a = generateSystem({ seed: 7, stepsPerFamily: 3, extraFamilies: 1 });
  const b = generateSystem({ seed: 7, stepsPerFamily: 3, extraFamilies: 1 });
  assert.deepEqual(a, b);

  const c = generateSystem({ seed: 8, stepsPerFamily: 3, extraFamilies: 1 });
  assert.notDeepEqual(a.families, c.families, "different seeds must differ");
});

test("generated colours are all perceptually distinct", () => {
  // Colour reuse across families is precisely what makes the real-site
  // benchmark undecidable; the generator must never reintroduce it.
  for (const seed of [1, 2, 3, 11, 99]) {
    const system = generateSystem({ seed, stepsPerFamily: 4, extraFamilies: 3 });
    const colors = [...systemTokens(system).values()];
    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        const delta = colorDistance(colors[i]!, colors[j]!);
        assert.ok(
          delta >= 5,
          `seed ${seed}: ${toHex(colors[i]!)} and ${toHex(colors[j]!)} differ by only ${delta.toFixed(1)}`,
        );
      }
    }
  }
});

test("difficulty withholds exactly the clues it claims to", () => {
  const declared = renderPage({ system: SYSTEM, difficulty: "declared" });
  const opaque = renderPage({ system: SYSTEM, difficulty: "opaque" });
  const inlined = renderPage({ system: SYSTEM, difficulty: "inlined" });
  const noisy = renderPage({ system: SYSTEM, difficulty: "noisy" });

  assert.match(declared, /--surface-1:/, "declared should name tokens semantically");
  assert.ok(!/--surface-1:/.test(opaque), "opaque must not leak semantic names");
  assert.match(opaque, /--v[a-z0-9]+:/, "opaque still declares variables, just meaningless ones");
  assert.ok(!/:root\s*\{/.test(inlined), "inlined must declare no custom properties at all");
  assert.match(noisy, /--docsearch-primary-color/, "noisy adds third-party variables");
  assert.match(noisy, /#8b5cf6/, "noisy paints off-system decoration");
  assert.ok(!/#8b5cf6/.test(inlined), "decoration belongs only to the noisy level");
});

test("every difficulty still renders a substantial page", () => {
  // A page that fails the harness readiness check would measure nothing.
  for (const difficulty of DIFFICULTIES) {
    const html = renderPage({ system: SYSTEM, difficulty });
    const elements = (html.match(/<(div|section|article|p|h1|h2|h3|a|span|tr|th|td|code)\b/g) ?? []).length;
    assert.ok(elements > 60, `${difficulty} rendered only ${elements} elements`);
    assert.ok(html.length > 4000, `${difficulty} produced only ${html.length} bytes`);
  }
});

test("inlined pages still paint every system colour", () => {
  // Removing the declarations must not remove the colours; otherwise the
  // higher difficulties would be measuring a different page, not a harder one.
  const html = renderPage({ system: SYSTEM, difficulty: "inlined" });
  for (const color of systemTokens(SYSTEM).values()) {
    assert.ok(html.includes(toHex(color)), `${toHex(color)} missing from inlined render`);
  }
});

test("every difficulty declares every colour exactly once", () => {
  // A name collision at the opaque level would let two tokens share one
  // declaration, silently dropping a colour. That produced a difficulty curve
  // where opaque scored worse than inlined -- an artefact of the renderer, not
  // of the clues withheld.
  for (const difficulty of DIFFICULTIES) {
    for (const seed of [1, 2, 3, 42]) {
      const system = generateSystem({ seed, stepsPerFamily: 4, extraFamilies: 2 });
      const html = renderPage({ system, difficulty });
      const expected = [...systemTokens(system).values()].map(toHex);
      for (const hex of expected) {
        assert.ok(html.includes(hex), `${difficulty} seed ${seed}: ${hex} not painted`);
      }
      if (difficulty === "opaque") {
        const declared = [...html.matchAll(/^\s*(--v[a-z0-9]+):/gm)].map((m) => m[1]);
        assert.equal(
          new Set(declared).size,
          declared.length,
          `opaque seed ${seed} emitted duplicate variable names`,
        );
        assert.equal(declared.length, expected.length, "one declaration per system colour");
      }
    }
  }
});

test("a perfect recovery scores at the top", () => {
  const score = scoreAgainstSystem(SYSTEM, perfectProposal());
  assert.equal(score.coverage, 1);
  assert.equal(score.precision, 1);
  assert.equal(score.structureRecovery, 1);
  assert.ok(score.score > 0.95, `perfect recovery scored ${score.score}`);
});

test("a flat dump keeps the values but loses the structure", () => {
  // This is the shape a rule-based agent produces, and the distinction the
  // value-only scorer could not see.
  const flat: DtcgGroup = { color: {} };
  let index = 0;
  for (const family of SYSTEM.families) {
    for (const step of family.steps) {
      (flat["color"] as DtcgGroup)[`c${index++}`] = { $value: toHex(step), $type: "color" };
    }
  }
  const flatScore = scoreAgainstSystem(SYSTEM, flat);
  const perfect = scoreAgainstSystem(SYSTEM, perfectProposal());

  assert.equal(flatScore.coverage, 1, "the values are all there");
  assert.ok(flatScore.structureRecovery < 0.6, `structure should collapse, got ${flatScore.structureRecovery}`);
  assert.equal(flatScore.roleNaming, 0, "index names identify no roles");
  assert.ok(perfect.score > flatScore.score + 0.3, `${perfect.score} vs ${flatScore.score}`);
});

test("adopting decorative colours costs precision", () => {
  const withStray = perfectProposal();
  (withStray["color"] as DtcgGroup)["brand"] = { $value: "#8b5cf6", $type: "color" };
  const score = scoreAgainstSystem(SYSTEM, withStray);
  assert.ok(score.precision < 1, "an off-system colour must be caught");
  assert.ok(score.detail.some((d) => /not part of the system/.test(d)));
});

test("missing colours cost coverage without touching precision", () => {
  const partial = perfectProposal();
  delete (partial["color"] as DtcgGroup)["accent"];
  const score = scoreAgainstSystem(SYSTEM, partial);
  assert.ok(score.coverage < 1, "an omitted family must reduce coverage");
  assert.equal(score.precision, 1, "what remains is still all correct");
});

test("an empty proposal scores zero rather than throwing", () => {
  const score = scoreAgainstSystem(SYSTEM, { color: {} });
  assert.equal(score.score, 0);
});
