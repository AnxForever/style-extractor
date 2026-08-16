import { test } from "node:test";
import assert from "node:assert/strict";

import { toDtcgDocument, validateDtcg, serializeDtcg, DTCG_TYPES } from "./dtcg.js";
import type { DtcgGroup } from "../agent/tools.js";

const PROPOSAL: DtcgGroup = {
  color: {
    surface: { $value: "#030712", $type: "color" },
    text: { $value: "#ffffff", $type: "color" },
    accent: { $value: "#00a7f4", $type: "color", $description: "primary action" },
  },
};

test("hex proposals widen into the spec's structured colour value", () => {
  const doc = toDtcgDocument(PROPOSAL, { source: "https://example.com" });
  const surface = (doc["color"] as Record<string, { $value: Record<string, unknown> }>)["surface"];
  assert.ok(surface);
  assert.equal(surface.$value["colorSpace"], "srgb");
  assert.equal(surface.$value["hex"], "#030712");

  const components = surface.$value["components"] as number[];
  assert.equal(components.length, 3);
  // Channels are 0..1 in the spec, not 0..255; emitting 3/7/18 here is the
  // mistake that silently produces near-white in a consuming tool.
  assert.ok(components.every((c) => c >= 0 && c <= 1), `components were ${components.join(",")}`);
  assert.ok(Math.abs((components[0] ?? 0) - 3 / 255) < 0.001);
});

test("descriptions and metadata survive conversion", () => {
  const doc = toDtcgDocument(PROPOSAL, { source: "https://example.com" });
  const accent = (doc["color"] as Record<string, { $description?: string }>)["accent"];
  assert.equal(accent?.$description, "primary action");
  assert.match(String(doc["$description"]), /example\.com/);
});

test("a converted document validates clean", () => {
  const issues = validateDtcg(toDtcgDocument(PROPOSAL));
  assert.deepEqual(issues, [], `unexpected issues: ${JSON.stringify(issues)}`);
});

test("validation rejects an unknown token type", () => {
  const issues = validateDtcg({ color: { bad: { $value: "#000000", $type: "colour" } } });
  assert.ok(issues.some((i) => i.severity === "error" && /unknown \$type/.test(i.message)));
});

test("validation rejects names containing the group separator", () => {
  // "color.surface" as a literal key is ambiguous with the path color -> surface,
  // and consumers resolve it inconsistently.
  const issues = validateDtcg({ "color.surface": { $value: "#000000", $type: "color" } });
  assert.ok(issues.some((i) => i.severity === "error" && /separator/.test(i.message)));
});

test("validation rejects out-of-range colour components", () => {
  const issues = validateDtcg({
    color: {
      surface: {
        $type: "color",
        $value: { colorSpace: "srgb", components: [3, 7, 18], alpha: 1, hex: "#030712" },
      },
    },
  });
  assert.ok(
    issues.some((i) => i.severity === "error" && /0\.\.1/.test(i.message)),
    "0..255 components must be caught",
  );
});

test("a bare hex colour is flagged as pre-2025.10 rather than accepted silently", () => {
  const issues = validateDtcg({ color: { surface: { $value: "#030712", $type: "color" } } });
  assert.ok(issues.some((i) => i.severity === "warning" && /structured/.test(i.message)));
});

test("group $type is inherited by its tokens", () => {
  const issues = validateDtcg({
    color: {
      $type: "color",
      surface: {
        $value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 1, hex: "#000000" },
      },
    },
  });
  assert.deepEqual(issues, [], `inheritance should satisfy the type requirement: ${JSON.stringify(issues)}`);
});

test("a token with no type anywhere is a warning, not silence", () => {
  const issues = validateDtcg({ spacing: { small: { $value: "4px" } } });
  assert.ok(issues.some((i) => i.severity === "warning" && /no \$type/.test(i.message)));
});

test("unparsable colours are preserved so validation can report them", () => {
  // Dropping them would make the document validate clean while quietly losing
  // a token the agent proposed.
  const doc = toDtcgDocument({ color: { broken: { $value: "not-a-colour", $type: "color" } } });
  const broken = (doc["color"] as Record<string, { $value: unknown }>)["broken"];
  assert.equal(broken?.$value, "not-a-colour");
  assert.ok(validateDtcg(doc).some((i) => i.severity === "error"));
});

test("serialization round-trips", () => {
  const doc = toDtcgDocument(PROPOSAL);
  const parsed = JSON.parse(serializeDtcg(doc));
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(doc)));
});

test("the declared type list matches the spec's token types", () => {
  for (const required of ["color", "dimension", "fontFamily", "shadow", "typography"]) {
    assert.ok((DTCG_TYPES as readonly string[]).includes(required), `${required} missing`);
  }
});
