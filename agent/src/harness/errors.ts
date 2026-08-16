/**
 * Failure taxonomy for extraction runs.
 *
 * The whole point of this module is attribution. A run that returns nothing is
 * useless on its own; a run that returns "died at readiness because the SPA
 * never painted" tells you which layer to fix. Every stage below maps to a
 * distinct remediation, which is what makes the L1 metric actionable rather
 * than a single pass/fail number.
 */

export type FailureStage =
  /** Never got a document: DNS, TLS, timeout, bot wall, non-2xx. */
  | "navigation"
  /** Document arrived but the page never became meaningful (SPA shell, lazy content). */
  | "readiness"
  /** Page was fine but the extractor modules could not be installed. */
  | "injection"
  /** Modules installed but the extraction call threw. */
  | "extraction"
  /** Extraction returned, but the payload carries no usable signal. */
  | "empty";

export type FailureReason =
  // navigation
  | "dns_or_connection"
  | "tls_error"
  | "navigation_timeout"
  | "http_error_status"
  | "bot_challenge"
  // readiness
  | "body_empty"
  | "render_timeout"
  // injection
  | "module_eval_error"
  | "critical_module_missing"
  // extraction
  | "extractor_threw"
  | "extraction_timeout"
  // empty
  | "no_colors"
  | "no_typography";

export interface HarnessFailure {
  readonly stage: FailureStage;
  readonly reason: FailureReason;
  readonly message: string;
  /** True when a retry with different settings has a realistic chance. */
  readonly retryable: boolean;
}

const RETRYABLE: ReadonlySet<FailureReason> = new Set<FailureReason>([
  "dns_or_connection",
  "navigation_timeout",
  "render_timeout",
  "body_empty",
  "extraction_timeout",
]);

export function makeFailure(
  stage: FailureStage,
  reason: FailureReason,
  message: string,
): HarnessFailure {
  return { stage, reason, message, retryable: RETRYABLE.has(reason) };
}

/**
 * Classify a Playwright navigation error.
 *
 * Playwright surfaces network problems as message strings rather than typed
 * errors, so string matching is the only option available at this layer.
 */
export function classifyNavigationError(error: unknown): HarnessFailure {
  const message = error instanceof Error ? error.message : String(error);

  if (/Timeout .* exceeded|net::ERR_TIMED_OUT/i.test(message)) {
    return makeFailure("navigation", "navigation_timeout", message);
  }
  if (/ERR_CERT|SSL|TLS/i.test(message)) {
    return makeFailure("navigation", "tls_error", message);
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_ADDRESS|ECONNREFUSED/i.test(message)) {
    return makeFailure("navigation", "dns_or_connection", message);
  }
  return makeFailure("navigation", "dns_or_connection", message);
}

/**
 * Heuristics for interstitials that return HTTP 200 while hiding the real page.
 * These are the pages that silently poison a dataset: everything downstream
 * "succeeds" and produces a design system for a CAPTCHA screen.
 */
const BOT_WALL_MARKERS: readonly RegExp[] = [
  /just a moment/i,
  /checking your browser/i,
  /cf-browser-verification/i,
  /enable javascript and cookies to continue/i,
  /attention required!\s*\|\s*cloudflare/i,
  /verifying you are human/i,
];

export function looksLikeBotChallenge(title: string, bodyText: string): boolean {
  const haystack = `${title}\n${bodyText.slice(0, 2000)}`;
  return BOT_WALL_MARKERS.some((pattern) => pattern.test(haystack));
}
