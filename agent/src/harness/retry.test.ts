import { test } from "node:test";
import assert from "node:assert/strict";

import { runResilientExtraction, variantsFor, type ExtractionRunner } from "./retry.js";
import { makeFailure } from "./errors.js";
import type { HarnessOptions, HarnessResult } from "./driver.js";

const BASE: HarnessOptions = {
  url: "https://example.com",
  preset: "style",
  outDir: "/tmp/retry-test",
};

function ok(options: HarnessOptions): HarnessResult {
  return { url: options.url, preset: options.preset, ok: true, timingsMs: {} };
}

function fail(
  options: HarnessOptions,
  stage: Parameters<typeof makeFailure>[0],
  reason: Parameters<typeof makeFailure>[1],
): HarnessResult {
  return {
    url: options.url,
    preset: options.preset,
    ok: false,
    failure: makeFailure(stage, reason, "synthetic"),
    timingsMs: {},
  };
}

/** Records the options each attempt was made with, so variation can be asserted. */
function recorder(behaviour: (call: number, options: HarnessOptions) => HarnessResult): {
  runner: ExtractionRunner;
  calls: HarnessOptions[];
} {
  const calls: HarnessOptions[] = [];
  return {
    calls,
    runner: async (options) => {
      calls.push(options);
      return behaviour(calls.length, options);
    },
  };
}

test("a successful first attempt is not retried", async () => {
  const { runner, calls } = recorder((_, options) => ok(options));
  const outcome = await runResilientExtraction(BASE, 3, undefined, runner);
  assert.equal(calls.length, 1);
  assert.equal(outcome.recovered, false);
  assert.deepEqual(
    outcome.attempts.map((a) => a.variant),
    ["initial"],
  );
});

test("a retryable failure is retried with changed conditions", async () => {
  // The point of the policy: attempt two must differ from attempt one.
  // Re-issuing an identical request is only a slower way to fail again.
  const { runner, calls } = recorder((call, options) =>
    call === 1 ? fail(options, "readiness", "render_timeout") : ok(options),
  );
  const outcome = await runResilientExtraction(BASE, 3, undefined, runner);

  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.recovered, true, "a rescued run must be reported as recovered");
  assert.equal(calls.length, 2);

  const first = calls[0];
  const second = calls[1];
  assert.ok(first && second);
  assert.notDeepEqual(first, second, "the retry must change something");
  assert.ok((second.settleMs ?? 0) > 0, "render_timeout should settle longer");
  assert.ok((second.scrollPasses ?? 0) > 0, "render_timeout should scroll for lazy content");
});

test("a non-retryable failure is not retried", async () => {
  const { runner, calls } = recorder((_, options) =>
    fail(options, "injection", "critical_module_missing"),
  );
  const outcome = await runResilientExtraction(BASE, 5, undefined, runner);
  assert.equal(calls.length, 1, "no variant exists for this cause; do not burn attempts");
  assert.equal(outcome.recovered, false);
});

test("a 403 is treated as refusal of this client, not as a dead page", async () => {
  const { runner, calls } = recorder((call, options) =>
    call === 1 ? fail(options, "navigation", "access_denied") : ok(options),
  );
  const outcome = await runResilientExtraction(BASE, 3, undefined, runner);
  assert.equal(outcome.recovered, true);
  assert.notEqual(calls[1]?.userAgent, calls[0]?.userAgent, "identity should change");
});

test("attempts stop when the variants for a cause are exhausted", async () => {
  // Mirrors the observed openai.com behaviour: every variant is tried, none
  // works, and the run reports the failure instead of looping.
  const { runner, calls } = recorder((_, options) => fail(options, "navigation", "access_denied"));
  const outcome = await runResilientExtraction(BASE, 10, undefined, runner);

  const available = variantsFor("access_denied").length;
  assert.equal(calls.length, available + 1, "one initial attempt plus each variant once");
  assert.equal(outcome.recovered, false);
  assert.equal(outcome.result.ok, false);
});

test("maxAttempts caps the work regardless of available variants", async () => {
  const { runner, calls } = recorder((_, options) => fail(options, "navigation", "access_denied"));
  await runResilientExtraction(BASE, 2, undefined, runner);
  assert.equal(calls.length, 2);
});

test("maxAttempts of 1 disables retrying", async () => {
  const { runner, calls } = recorder((_, options) => fail(options, "readiness", "render_timeout"));
  const outcome = await runResilientExtraction(BASE, 1, undefined, runner);
  assert.equal(calls.length, 1);
  assert.equal(outcome.attempts.length, 1);
});

test("every retryable reason has at least one variant", async () => {
  // Guards the invariant stated in errors.ts: marking a reason retryable is a
  // promise that something can actually be varied. A reason marked retryable
  // with no variant would silently never retry.
  const retryable = [
    "dns_or_connection",
    "navigation_timeout",
    "render_timeout",
    "body_empty",
    "extraction_timeout",
    "access_denied",
    "bot_challenge",
  ] as const;
  for (const reason of retryable) {
    assert.ok(variantsFor(reason).length > 0, `${reason} is retryable but has no variant`);
  }
});

test("extraction timeout falls back to a cheaper preset", async () => {
  const { runner, calls } = recorder((call, options) =>
    call === 1 ? fail(options, "extraction", "extraction_timeout") : ok(options),
  );
  await runResilientExtraction(BASE, 3, undefined, runner);
  assert.equal(calls[1]?.preset, "minimal", "should retry with a lighter workload");
});
