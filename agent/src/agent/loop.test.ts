import { test } from "node:test";
import assert from "node:assert/strict";

import { runAgentLoop } from "./loop.js";
import { createMockProvider } from "./provider.js";
import { createTracer } from "./trace.js";
import type { AgentWorkspace } from "./tools.js";
import type { GroundTruth } from "../eval/ground-truth.js";
import type { Rgb } from "../eval/color.js";

const SURFACE: Rgb = { r: 3, g: 7, b: 18, a: 1 };
const TEXT: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const ACCENT: Rgb = { r: 0, g: 167, b: 244, a: 1 };

function makeTruth(): GroundTruth {
  return {
    scheme: "dark",
    surface: { background: SURFACE, foreground: TEXT },
    palette: [
      { color: SURFACE, areaShare: 0.7 },
      { color: TEXT, areaShare: 0.2 },
      { color: ACCENT, areaShare: 0.1 },
    ],
    allColors: [SURFACE, TEXT, ACCENT],
    typography: { families: ["Inter"], sizeScale: [14, 16, 24, 48] },
  };
}

function makeWorkspace(): AgentWorkspace {
  const truth = makeTruth();
  return {
    extraction: { data: { css: { variables: { "--color-surface": "#030712" } } } },
    truth: { light: truth, dark: truth },
    claimedColors: [SURFACE, TEXT, ACCENT],
  };
}

const GOOD_TOKENS = {
  color: {
    surface: { $value: "#030712", $type: "color" },
    text: { $value: "#ffffff", $type: "color" },
    accent: { $value: "#00a7f4", $type: "color" },
  },
};

const BAD_TOKENS = {
  color: {
    invented: { $value: "#ff00ff", $type: "color" },
  },
};

test("loop stops when the model stops requesting tools", async () => {
  const provider = createMockProvider([{ text: "Nothing to do." }]);
  const result = await runAgentLoop({
    provider,
    workspace: makeWorkspace(),
    tracer: createTracer(),
  });
  assert.equal(result.reason, "model_finished");
  assert.equal(result.turns, 1);
});

test("loop honours the turn cap instead of running forever", async () => {
  // A model that always asks for another tool call must not be able to spin
  // indefinitely; this is the runaway-cost guard.
  const script = Array.from({ length: 50 }, () => ({
    calls: [{ name: "survey", input: {} }],
  }));
  const result = await runAgentLoop({
    provider: createMockProvider(script),
    workspace: makeWorkspace(),
    tracer: createTracer(),
    maxTurns: 4,
  });
  assert.equal(result.reason, "turn_budget");
  assert.equal(result.turns, 4);
});

test("tool faults are fed back to the agent rather than crashing the run", async () => {
  const tracer = createTracer();
  const result = await runAgentLoop({
    provider: createMockProvider([
      { calls: [{ name: "no_such_tool", input: {} }] },
      { calls: [{ name: "check_color", input: { hex: "not-a-colour" } }] },
      { text: "giving up" },
    ]),
    workspace: makeWorkspace(),
    tracer,
    maxTurns: 5,
  });

  assert.equal(result.reason, "model_finished");
  const errors = tracer.events.filter((e) => e.type === "tool_result" && e.isError);
  assert.equal(errors.length, 2, "both faults should be recorded as errors");
});

test("the best proposal survives a worse later revision", async () => {
  // Agent trajectories are not monotone. Returning the final state would throw
  // away a better earlier answer, which is the failure this guards.
  const result = await runAgentLoop({
    provider: createMockProvider([
      { calls: [{ name: "propose_tokens", input: { tokens: GOOD_TOKENS } }] },
      { calls: [{ name: "propose_tokens", input: { tokens: BAD_TOKENS } }] },
      { text: "done" },
    ]),
    workspace: makeWorkspace(),
    tracer: createTracer(),
    maxTurns: 5,
    targetScore: 2, // unreachable, so the loop runs the whole script
  });

  assert.ok(result.bestScore, "a score should be recorded");
  assert.ok(result.bestScore.score > 0.5, `best score was ${result.bestScore.score}`);
  const names = Object.keys((result.bestProposal?.["color"] ?? {}) as object);
  assert.ok(names.includes("surface"), `expected the good proposal, got ${names.join(",")}`);
  assert.ok(!names.includes("invented"), "must not return the worse revision");
});

test("reaching the target score ends the run early", async () => {
  const result = await runAgentLoop({
    provider: createMockProvider([
      { calls: [{ name: "propose_tokens", input: { tokens: GOOD_TOKENS } }] },
      { calls: [{ name: "survey", input: {} }] },
      { calls: [{ name: "survey", input: {} }] },
    ]),
    workspace: makeWorkspace(),
    tracer: createTracer(),
    maxTurns: 10,
    targetScore: 0.6,
  });
  assert.equal(result.reason, "goal_reached");
  assert.equal(result.turns, 1, "should not keep going after the goal is met");
});

test("provider failure returns partial progress instead of throwing", async () => {
  const failing = {
    name: "failing",
    async complete(): Promise<never> {
      throw new Error("upstream 503");
    },
  };
  const result = await runAgentLoop({
    provider: failing,
    workspace: makeWorkspace(),
    tracer: createTracer(),
  });
  assert.equal(result.reason, "error");
  assert.match(result.error ?? "", /503/);
});

test("older tool output is elided to bound context growth", async () => {
  const provider = createMockProvider(
    Array.from({ length: 8 }, () => ({ calls: [{ name: "survey", input: {} }] })),
  );
  await runAgentLoop({
    provider,
    workspace: makeWorkspace(),
    tracer: createTracer(),
    maxTurns: 8,
    detailWindow: 1,
  });

  const lastRequest = provider.seen.at(-1);
  assert.ok(lastRequest);
  const elided = lastRequest.turns.filter(
    (turn) => turn.role === "tool_results" && turn.results.some((r) => r.content.includes("elided")),
  );
  assert.ok(elided.length > 0, "early tool results should be compacted");

  // The task framing must never be the thing that gets dropped.
  assert.equal(lastRequest.turns[0]?.role, "user");
});

test("scoring rejects a proposal of colours that were never painted", async () => {
  const result = await runAgentLoop({
    provider: createMockProvider([
      { calls: [{ name: "propose_tokens", input: { tokens: BAD_TOKENS } }] },
      { text: "done" },
    ]),
    workspace: makeWorkspace(),
    tracer: createTracer(),
    targetScore: 2,
  });
  assert.ok(result.bestScore);
  assert.ok(
    result.bestScore.score < 0.4,
    `invented colours should score low, got ${result.bestScore.score}`,
  );
  assert.ok(
    result.bestScore.feedback.some((line) => /not painted/i.test(line)),
    "feedback should name the problem concretely",
  );
});

test("the score rewards naming, not just correct values", async () => {
  // The whole premise of putting a model in this pipeline: the extractor
  // already produces correct values, so a scoring function that only checks
  // values would leave the agent nothing to improve. Correct colours under
  // index names must score materially worse than the same colours named by
  // role, or the self-correction loop has no gradient to climb.
  const valuesOnly = {
    color: {
      c0: { $value: "#030712", $type: "color" },
      c1: { $value: "#ffffff", $type: "color" },
      c2: { $value: "#00a7f4", $type: "color" },
    },
  };

  const run = async (tokens: object) =>
    runAgentLoop({
      provider: createMockProvider([{ calls: [{ name: "propose_tokens", input: { tokens } }] }, { text: "done" }]),
      workspace: makeWorkspace(),
      tracer: createTracer(),
      targetScore: 2,
    });

  const unnamed = (await run(valuesOnly)).bestScore;
  const named = (await run(GOOD_TOKENS)).bestScore;
  assert.ok(unnamed && named);

  assert.equal(unnamed.coverage, named.coverage, "identical values must score identically on coverage");
  assert.ok(
    named.score > unnamed.score + 0.3,
    `naming must be worth a clear margin: ${named.score} vs ${unnamed.score}`,
  );
  assert.equal(unnamed.roleAccuracy, 0, "index names identify no roles");
  assert.equal(named.roleAccuracy, 1, "surface and text should both be identified");
  assert.equal(unnamed.semanticNaming, 0);
});

test("feedback gives the agent a path from a bad proposal to a good one", async () => {
  // Verifies the correction loop end to end: a weak first attempt produces
  // specific, actionable feedback, and acting on that feedback raises the
  // score. Without this the loop could be structurally sound yet still be
  // climbing nothing.
  const workspace = makeWorkspace();
  const result = await runAgentLoop({
    provider: createMockProvider([
      { calls: [{ name: "survey", input: {} }] },
      { calls: [{ name: "propose_tokens", input: { tokens: BAD_TOKENS } }] },
      { calls: [{ name: "score_proposal", input: {} }] },
      { calls: [{ name: "propose_tokens", input: { tokens: GOOD_TOKENS } }] },
      { calls: [{ name: "score_proposal", input: {} }] },
      { text: "converged" },
    ]),
    workspace,
    tracer: createTracer(),
    maxTurns: 8,
    targetScore: 2,
  });

  assert.equal(result.reason, "model_finished");
  assert.ok(result.bestScore);
  assert.ok(
    result.bestScore.score > 0.8,
    `acting on feedback should reach a good score, got ${result.bestScore.score}`,
  );
  assert.ok(
    result.bestScore.feedback.some((line) => /no structural problems/i.test(line)),
    "a good proposal should report clean",
  );
});
