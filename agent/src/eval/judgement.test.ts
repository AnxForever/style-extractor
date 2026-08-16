import { test } from "node:test";
import assert from "node:assert/strict";

import { judgeProposal } from "./judgement.js";
import { readAuthorIntent, parseDeclaredColor } from "./author-intent.js";
import type { DtcgGroup } from "../agent/tools.js";

/**
 * A page in the shape svelte.dev publishes: two families of elevation steps,
 * an accent, and framework noise that is not part of the design.
 */
const EXTRACTION = {
  data: {
    css: {
      variables: {
        root: {
          "--sk-fg-1": "#141414",
          "--sk-fg-2": "#262626",
          "--sk-fg-3": "#666666",
          "--sk-bg-1": "#ffffff",
          "--sk-bg-2": "#fafafa",
          "--sk-bg-3": "#f2f2f2",
          "--sk-fg-accent": "#d43008",
          "--tw-ring-color": "#3b82f6",
          "--docsearch-primary-color": "#5468ff",
        },
      },
    },
  },
};

/** What a heuristic produces: everything flat, invented vocabulary. */
const FLAT: DtcgGroup = {
  color: {
    surface: { $value: "#ffffff", $type: "color" },
    text: { $value: "#141414", $type: "color" },
    accent: { $value: "#d43008", $type: "color" },
    muted1: { $value: "#262626", $type: "color" },
    muted2: { $value: "#666666", $type: "color" },
    muted3: { $value: "#fafafa", $type: "color" },
    muted4: { $value: "#f2f2f2", $type: "color" },
  },
};

/** What recovering the author's structure looks like. */
const GROUPED: DtcgGroup = {
  color: {
    fg: {
      "1": { $value: "#141414", $type: "color" },
      "2": { $value: "#262626", $type: "color" },
      "3": { $value: "#666666", $type: "color" },
    },
    bg: {
      "1": { $value: "#ffffff", $type: "color" },
      "2": { $value: "#fafafa", $type: "color" },
      "3": { $value: "#f2f2f2", $type: "color" },
    },
    accent: { $value: "#d43008", $type: "color" },
  },
};

test("author intent recovers families from declared names", () => {
  const intent = readAuthorIntent(EXTRACTION);
  assert.equal(intent.families.size, 2, `expected fg and bg, got ${[...intent.families.keys()]}`);
  assert.equal(intent.families.get("fg")?.length, 3);
  assert.equal(intent.families.get("bg")?.length, 3);
});

test("author intent rejects framework and widget variables", () => {
  const intent = readAuthorIntent(EXTRACTION);
  assert.ok(intent.rejected.includes("--tw-ring-color"));
  assert.ok(intent.rejected.includes("--docsearch-primary-color"));
  assert.ok(
    !intent.variables.some((v) => v.name.startsWith("--tw-")),
    "compiler internals are not design decisions",
  );
});

test("recovering the author's structure scores far above a flat dump", () => {
  // The property that motivated rebuilding the scorer: the previous, value-only
  // metric rated both of these at 0.99 because their colours are identical.
  // Only the organisation differs, and organisation is the part rules cannot do.
  const flat = judgeProposal(EXTRACTION, FLAT);
  const grouped = judgeProposal(EXTRACTION, GROUPED);

  assert.ok(flat.score !== null && grouped.score !== null);
  assert.ok(
    grouped.score > flat.score + 0.3,
    `grouping must be worth a clear margin: ${grouped.score} vs ${flat.score}`,
  );
  assert.equal(grouped.structureRecovery.value, 1, "correct grouping should be exact");
  assert.ok(
    (flat.structureRecovery.value ?? 1) < 1,
    "a flat dump merges families that the author separated",
  );
});

test("reusing the author's vocabulary is rewarded", () => {
  const flat = judgeProposal(EXTRACTION, FLAT);
  const grouped = judgeProposal(EXTRACTION, GROUPED);
  assert.ok(
    (grouped.vocabularyAlignment.value ?? 0) > (flat.vocabularyAlignment.value ?? 0),
    "fg/bg come from the page; surface/muted were invented",
  );
});

test("adopting a third-party widget colour costs the noise score", () => {
  const withNoise: DtcgGroup = {
    color: {
      ...(GROUPED["color"] as DtcgGroup),
      // #5468ff is DocSearch's, not the site's.
      brand: { $value: "#5468ff", $type: "color" },
    },
  };
  const clean = judgeProposal(EXTRACTION, GROUPED);
  const dirty = judgeProposal(EXTRACTION, withNoise);
  assert.equal(clean.noiseRejection.value, 1);
  assert.ok(
    (dirty.noiseRejection.value ?? 1) < 1,
    "a widget colour presented as a design token must be penalised",
  );
});

test("a page that declares nothing is not applicable rather than a zero", () => {
  // Tailwind-compiled sites inline their variables. Scoring zero there would
  // measure the page's build tooling, not the proposal.
  const compiled = { data: { css: { variables: { root: { "--tw-ring-color": "#3b82f6" } } } } };
  const judged = judgeProposal(compiled, GROUPED);
  assert.equal(judged.score, null);
  assert.equal(judged.applicable, 0);
  assert.equal(judged.structureRecovery.value, null);
});

test("colours shared across families are skipped, not guessed", () => {
  // #ffffff belongs to two families here, so no value-based matcher can say
  // which one a proposal meant. Reporting a confident verdict would be an
  // artefact of the matcher.
  const shared = {
    data: {
      css: {
        variables: {
          root: {
            "--fg-1": "#ffffff",
            "--fg-2": "#262626",
            "--bg-1": "#ffffff",
            "--bg-2": "#fafafa",
          },
        },
      },
    },
  };
  const judged = judgeProposal(shared, GROUPED);
  assert.match(judged.structureRecovery.detail, /skipped|unambiguously/);
});

test("surface/foreground pairs are recognised and scored", () => {
  const paired = {
    data: {
      css: {
        variables: {
          root: {
            "--card": "#111111",
            "--card-foreground": "#eeeeee",
            "--panel": "#222222",
            "--panel-foreground": "#dddddd",
          },
        },
      },
    },
  };
  const intent = readAuthorIntent(paired);
  assert.equal(intent.pairs.length, 2, `expected two pairs, got ${JSON.stringify(intent.pairs)}`);

  const together: DtcgGroup = {
    color: {
      card: {
        base: { $value: "#111111", $type: "color" },
        foreground: { $value: "#eeeeee", $type: "color" },
      },
      panel: {
        base: { $value: "#222222", $type: "color" },
        foreground: { $value: "#dddddd", $type: "color" },
      },
    },
  };
  const scattered: DtcgGroup = {
    surfaces: {
      a: { $value: "#111111", $type: "color" },
      c: { $value: "#222222", $type: "color" },
    },
    text: {
      b: { $value: "#eeeeee", $type: "color" },
      d: { $value: "#dddddd", $type: "color" },
    },
  };

  assert.equal(judgeProposal(paired, together).pairingRecovery.value, 1);
  assert.equal(judgeProposal(paired, scattered).pairingRecovery.value, 0);
});

test("declared colour notations parse, and unknown ones are refused", () => {
  assert.deepEqual(parseDeclaredColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseDeclaredColor("#141414"), { r: 20, g: 20, b: 20, a: 1 });
  assert.deepEqual(parseDeclaredColor("rgb(20, 30, 40)"), { r: 20, g: 30, b: 40, a: 1 });
  assert.deepEqual(parseDeclaredColor("black"), { r: 0, g: 0, b: 0, a: 1 });

  const hsl = parseDeclaredColor("hsl(0, 0%, 100%)");
  assert.deepEqual(hsl, { r: 255, g: 255, b: 255, a: 1 });

  // A reference cannot be resolved offline, and a wrong reference is worse
  // than a smaller one.
  assert.equal(parseDeclaredColor("var(--other)"), null);
  assert.equal(parseDeclaredColor("inherit"), null);
});

test("numeric scales are read as one family, not many", () => {
  const scale = {
    data: {
      css: {
        variables: {
          root: {
            "--gray1": "hsl(0, 0%, 99%)",
            "--gray2": "hsl(0, 0%, 97%)",
            "--gray3": "hsl(0, 0%, 95%)",
          },
        },
      },
    },
  };
  const intent = readAuthorIntent(scale);
  assert.equal(intent.families.size, 1);
  assert.equal(intent.families.get("gray")?.length, 3);
});
