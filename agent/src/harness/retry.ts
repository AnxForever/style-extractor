import { runExtraction, type HarnessOptions, type HarnessResult } from "./driver.js";
import type { FailureReason } from "./errors.js";

/**
 * Retry with variation.
 *
 * Repeating an identical request is a slower way to get an identical failure.
 * Every variant here changes the conditions in a way that addresses a specific
 * diagnosed cause, which is the reason the failure taxonomy carries a reason
 * code at all -- without attribution there is nothing to vary, and a retry
 * policy degenerates into a delay loop.
 *
 * Variants are also honest about their own limits: a site that refuses a
 * headless client outright will still refuse it, and the run reports that
 * rather than burning attempts pretending otherwise.
 */

export interface RetryVariant {
  readonly label: string;
  /** Why this change is expected to address the diagnosed failure. */
  readonly rationale: string;
  readonly adjust: (options: HarnessOptions) => HarnessOptions;
}

/**
 * A recent, complete desktop fingerprint. Some bot defences reject on UA
 * alone; others check for headless-specific signals this cannot fix.
 */
const ALTERNATE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const VARIANTS: Partial<Record<FailureReason, readonly RetryVariant[]>> = {
  navigation_timeout: [
    {
      label: "longer-navigation",
      rationale: "slow origin or cold cache; give the document more time",
      adjust: (options) => ({ ...options, navigationTimeoutMs: 90_000 }),
    },
  ],
  dns_or_connection: [
    {
      label: "retry-connection",
      rationale: "transient network fault; a second attempt may connect",
      adjust: (options) => ({ ...options, navigationTimeoutMs: 60_000 }),
    },
  ],
  render_timeout: [
    {
      label: "settle-and-scroll",
      rationale: "client-rendered content that paints late or only on scroll",
      adjust: (options) => ({
        ...options,
        navigationTimeoutMs: 90_000,
        settleMs: 3_000,
        scrollPasses: 3,
      }),
    },
  ],
  body_empty: [
    {
      label: "settle-and-scroll",
      rationale: "hydration had not produced content at first measurement",
      adjust: (options) => ({ ...options, settleMs: 4_000, scrollPasses: 2 }),
    },
  ],
  extraction_timeout: [
    {
      label: "reduced-preset",
      rationale: "full extraction is too heavy for this page; take the core subset",
      adjust: (options) => ({ ...options, preset: "minimal", extractionTimeoutMs: 120_000 }),
    },
  ],
  access_denied: [
    {
      label: "alternate-fingerprint",
      rationale: "server refused this client; present a different browser identity",
      adjust: (options) => ({ ...options, userAgent: ALTERNATE_UA, navigationTimeoutMs: 60_000 }),
    },
    {
      label: "headed-browser",
      rationale: "headless-specific signals are a common refusal trigger",
      adjust: (options) => ({ ...options, headless: false, userAgent: ALTERNATE_UA }),
    },
  ],
  bot_challenge: [
    {
      label: "alternate-fingerprint",
      rationale: "interstitial keyed on client identity; change it and settle longer",
      adjust: (options) => ({ ...options, userAgent: ALTERNATE_UA, settleMs: 5_000 }),
    },
    {
      label: "headed-browser",
      rationale: "some challenges clear only in a non-headless context",
      adjust: (options) => ({ ...options, headless: false, settleMs: 6_000 }),
    },
  ],
};

export interface Attempt {
  readonly variant: string;
  readonly ok: boolean;
  readonly reason?: FailureReason;
}

export interface ResilientResult {
  readonly result: HarnessResult;
  readonly attempts: readonly Attempt[];
  /** True when a retry variant rescued a run that first failed. */
  readonly recovered: boolean;
}

export function variantsFor(reason: FailureReason): readonly FailureVariantList[number][] {
  return VARIANTS[reason] ?? [];
}

type FailureVariantList = readonly RetryVariant[];

/** Injectable for testing; production always uses the real driver. */
export type ExtractionRunner = (options: HarnessOptions) => Promise<HarnessResult>;

/**
 * Run an extraction, applying diagnosed-cause variants until one succeeds.
 *
 * @param maxAttempts total attempts including the first, so 1 disables retries.
 */
export async function runResilientExtraction(
  options: HarnessOptions,
  maxAttempts = 3,
  onAttempt?: (attempt: Attempt, rationale: string) => void,
  runner: ExtractionRunner = runExtraction,
): Promise<ResilientResult> {
  const attempts: Attempt[] = [];

  let result = await runner(options);
  attempts.push({
    variant: "initial",
    ok: result.ok,
    ...(result.failure ? { reason: result.failure.reason } : {}),
  });
  if (result.ok) return { result, attempts, recovered: false };

  const tried = new Set<string>();

  while (attempts.length < maxAttempts) {
    const failure = result.failure;
    if (!failure?.retryable) break;

    const candidate = variantsFor(failure.reason).find((v) => !tried.has(v.label));
    if (!candidate) break;
    tried.add(candidate.label);

    const attempt: Attempt = { variant: candidate.label, ok: false };
    onAttempt?.(attempt, candidate.rationale);

    result = await runner(candidate.adjust(options));
    attempts.push({
      variant: candidate.label,
      ok: result.ok,
      ...(result.failure ? { reason: result.failure.reason } : {}),
    });
    if (result.ok) return { result, attempts, recovered: true };
  }

  return { result, attempts, recovered: false };
}
