import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

import {
  EXTRACTOR_MODULES,
  type ExtractionPreset,
  type ExtractorModule,
} from "./scripts.js";
import {
  classifyNavigationError,
  looksLikeBotChallenge,
  makeFailure,
  type HarnessFailure,
} from "./errors.js";
import { collectGroundTruth, type GroundTruth } from "../eval/ground-truth.js";
import { scoreAccuracy, type AccuracyReport } from "../eval/accuracy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(HERE, "../../../scripts");

export interface HarnessOptions {
  readonly url: string;
  readonly preset: ExtractionPreset;
  readonly outDir: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly navigationTimeoutMs?: number;
  readonly extractionTimeoutMs?: number;
  readonly headless?: boolean;
  /** Override the browser fingerprint; used by retry variants against bot defence. */
  readonly userAgent?: string;
  /** Extra settle time after the readiness check, for slow client-side content. */
  readonly settleMs?: number;
  /** Scroll passes to trigger lazy-loaded sections before measuring. */
  readonly scrollPasses?: number;
  /**
   * Collect ground truth and score L2 accuracy in the same page session.
   * Sampling truth from a second page load would compare the extraction
   * against a different render -- carousels, A/B buckets and time-sensitive
   * content all drift between loads and would surface as accuracy errors.
   */
  readonly withGroundTruth?: boolean;
}

export interface ModuleLoadReport {
  readonly loaded: readonly string[];
  readonly failed: readonly { readonly file: string; readonly error: string }[];
  readonly missingCritical: readonly string[];
}

export interface HarnessResult {
  readonly url: string;
  readonly preset: ExtractionPreset;
  readonly ok: boolean;
  readonly failure?: HarnessFailure;
  readonly modules?: ModuleLoadReport;
  readonly extraction?: unknown;
  readonly screenshotPath?: string;
  readonly truth?: { readonly light: GroundTruth; readonly dark: GroundTruth };
  readonly accuracy?: AccuracyReport;
  /** Why ground-truth scoring was skipped, when it was requested but failed. */
  readonly truthError?: string;
  readonly timingsMs: Readonly<Record<string, number>>;
}

const DEFAULTS = {
  viewport: { width: 1440, height: 900 },
  navigationTimeoutMs: 45_000,
  extractionTimeoutMs: 90_000,
  headless: true,
  // A default Playwright UA trips more bot walls than a stock desktop one.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  settleMs: 0,
  scrollPasses: 0,
} as const;

/** Cache module sources across runs so a batch does not re-read 23 files per URL. */
let sourceCache: Map<string, string> | null = null;

async function loadModuleSources(): Promise<Map<string, string>> {
  if (sourceCache) return sourceCache;
  const cache = new Map<string, string>();
  await Promise.all(
    EXTRACTOR_MODULES.map(async (module) => {
      cache.set(module.file, await readFile(join(SCRIPTS_DIR, module.file), "utf8"));
    }),
  );
  sourceCache = cache;
  return cache;
}

/**
 * Install the extraction modules into the live page.
 *
 * The original loader fetched each script from a URL and eval'd it in page
 * context, which fails on any site with a restrictive CSP or without CORS
 * headers for the script origin. Passing the source straight to page.evaluate
 * runs it through CDP's Runtime.evaluate instead, which is not subject to the
 * page's CSP -- so script installation stops being a source of dataset loss.
 */
async function injectModules(page: Page): Promise<ModuleLoadReport> {
  const sources = await loadModuleSources();
  const loaded: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const module of EXTRACTOR_MODULES) {
    const source = sources.get(module.file);
    if (source === undefined) {
      failed.push({ file: module.file, error: "source not found on disk" });
      continue;
    }
    try {
      await page.evaluate(source);
      loaded.push(module.file);
    } catch (error) {
      failed.push({
        file: module.file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const installed = await page.evaluate<Record<string, boolean>, string[]>(
    (globals) => {
      const seen: Record<string, boolean> = {};
      for (const name of globals) {
        seen[name] = Boolean((window as unknown as Record<string, unknown>)[name]);
      }
      return seen;
    },
    EXTRACTOR_MODULES.map((m) => m.global),
  );

  const missingCritical = EXTRACTOR_MODULES.filter(
    (m: ExtractorModule) => m.critical && !installed[m.global],
  ).map((m) => m.global);

  return { loaded, failed, missingCritical };
}

/**
 * Wait for the page to be worth extracting from.
 *
 * Three separate conditions, because each one failing produces a different
 * kind of garbage downstream:
 *  - no meaningful DOM yet  -> extraction returns nothing (L1 empty)
 *  - webfonts still pending -> computed styles report fallback stacks, so the
 *    extracted typography is confidently wrong (L2 inaccuracy)
 *  - network still churning -> above-the-fold imagery and lazy sections missing
 */
async function waitForMeaningfulRender(page: Page, timeoutMs: number): Promise<void> {
  // All three conditions must hold, not any one of them. A single-condition
  // check passes on an unhydrated SPA shell -- plenty of elements, no content
  // -- and every downstream metric then describes an empty page while
  // reporting success. A readiness timeout is a far more useful outcome than a
  // confident measurement of nothing.
  await page.waitForFunction(
    () => {
      const body = document.body;
      if (!body) return false;
      const hasText = (body.innerText ?? "").trim().length > 200;
      const hasStructure = body.querySelectorAll("*").length > 50;
      const hasPaintedArea = body.getBoundingClientRect().height > 200;
      return hasText && hasStructure && hasPaintedArea;
    },
    undefined,
    { timeout: timeoutMs },
  );

  // Webfonts decide the typography tokens; never sample before they settle.
  await page
    .evaluate(() => document.fonts?.ready?.then(() => undefined))
    .catch(() => undefined);

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

/**
 * page.evaluate has no timeout option, so a hung extractor would otherwise
 * block the whole batch. Racing against a timer keeps one bad site from
 * costing an entire run.
 */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`extraction timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasUsableSignal(extraction: unknown): { colors: boolean; typography: boolean } {
  const serialized = JSON.stringify(extraction ?? null);
  if (!serialized) return { colors: false, typography: false };
  return {
    // Modern sites serve lab()/oklch() from the CSS Color 4 space, not just hex
    // or rgb(). A hex-only probe reports "no colors" on pages that are in fact
    // fully themed -- the exact false negative this metric exists to avoid.
    colors:
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|oklab|lch|oklch|color)\(/i.test(serialized),
    typography: /fontFamily|font-family/i.test(serialized),
  };
}

export async function runExtraction(options: HarnessOptions): Promise<HarnessResult> {
  const viewport = options.viewport ?? DEFAULTS.viewport;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? DEFAULTS.navigationTimeoutMs;
  const extractionTimeoutMs = options.extractionTimeoutMs ?? DEFAULTS.extractionTimeoutMs;
  const headless = options.headless ?? DEFAULTS.headless;

  const timingsMs: Record<string, number> = {};
  const mark = (label: string, startedAt: number): void => {
    timingsMs[label] = Math.round(performance.now() - startedAt);
  };

  const base = { url: options.url, preset: options.preset } as const;
  let browser: Browser | undefined;

  try {
    const launchedAt = performance.now();
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport,
      userAgent: options.userAgent ?? DEFAULTS.userAgent,
    });
    const page = await context.newPage();

    // esbuild (which tsx uses) wraps named functions in a __name() helper to
    // preserve Function.prototype.name. Functions handed to page.evaluate are
    // serialised with those calls intact, but the helper only exists in the
    // Node bundle -- so every in-page evaluate would die with
    // "__name is not defined". Injected as a string so esbuild cannot rewrite
    // the polyfill itself.
    await context.addInitScript(
      "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
    );
    mark("launch", launchedAt);

    // -- navigation ---------------------------------------------------------
    const navigatedAt = performance.now();
    let status: number | null = null;
    try {
      const response = await page.goto(options.url, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeoutMs,
      });
      status = response?.status() ?? null;
    } catch (error) {
      return { ...base, ok: false, failure: classifyNavigationError(error), timingsMs };
    }
    mark("navigation", navigatedAt);

    if (status !== null && status >= 400) {
      // 403 and 429 mean the server answered and refused this specific client,
      // which is a different situation from a page that does not exist: a
      // changed fingerprint or a slower approach can succeed where the first
      // attempt did not.
      const denied = status === 403 || status === 429;
      return {
        ...base,
        ok: false,
        failure: makeFailure(
          "navigation",
          denied ? "access_denied" : "http_error_status",
          `HTTP ${status}`,
        ),
        timingsMs,
      };
    }

    // -- readiness ----------------------------------------------------------
    const readyAt = performance.now();
    try {
      await waitForMeaningfulRender(page, navigationTimeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        ok: false,
        failure: makeFailure("readiness", "render_timeout", message),
        timingsMs,
      };
    }

    // Lazy-loaded sections below the fold never paint without a scroll, and a
    // colour that never painted cannot be measured. Retry variants raise this
    // when a first pass produced too little signal.
    const scrollPasses = options.scrollPasses ?? DEFAULTS.scrollPasses;
    for (let pass = 0; pass < scrollPasses; pass += 1) {
      await page
        .evaluate(() => window.scrollBy(0, window.innerHeight * 0.9))
        .catch(() => undefined);
      await page.waitForTimeout(500);
    }
    if (scrollPasses > 0) {
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
      await page.waitForTimeout(300);
    }

    const settleMs = options.settleMs ?? DEFAULTS.settleMs;
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    mark("readiness", readyAt);

    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    if (looksLikeBotChallenge(title, bodyText)) {
      return {
        ...base,
        ok: false,
        failure: makeFailure(
          "navigation",
          "bot_challenge",
          `interstitial detected: ${title}`,
        ),
        timingsMs,
      };
    }

    // -- ground truth (must precede injection) -------------------------------
    // The extraction modules mutate the page: theme-detect.js exposes a
    // switchTheme() that rewrites root DOM state, and several modules cache
    // computed values onto elements. Sampling truth afterwards measures a page
    // the subject under test already altered -- observed concretely as body
    // reporting white text on a white background under the light scheme.
    // Collect first, then restore the default media state so the extraction
    // still observes the site the way an ordinary visitor would.
    let truth: { light: GroundTruth; dark: GroundTruth } | undefined;
    let truthError: string | undefined;
    if (options.withGroundTruth) {
      const truthAt = performance.now();
      try {
        const light = await collectGroundTruth(page, "light");
        const dark = await collectGroundTruth(page, "dark");
        truth = { light, dark };
      } catch (error) {
        truthError = error instanceof Error ? error.message : String(error);
      }
      await page.emulateMedia({ colorScheme: null }).catch(() => undefined);
      await page.waitForTimeout(400);
      mark("groundTruth", truthAt);
    }

    // -- injection ----------------------------------------------------------
    const injectedAt = performance.now();
    const modules = await injectModules(page);
    mark("injection", injectedAt);

    if (modules.missingCritical.length > 0) {
      return {
        ...base,
        ok: false,
        modules,
        failure: makeFailure(
          "injection",
          "critical_module_missing",
          `missing: ${modules.missingCritical.join(", ")}`,
        ),
        timingsMs,
      };
    }

    // -- extraction ---------------------------------------------------------
    const extractedAt = performance.now();
    let extraction: unknown;
    try {
      extraction = await withTimeout(
        page.evaluate(
          async (preset) => {
            const entry = (window as unknown as Record<string, unknown>)["extractStyle"];
            if (typeof entry !== "function") {
              throw new Error("window.extractStyle is not installed");
            }
            return await (entry as (opts: { preset: string }) => Promise<unknown>)({ preset });
          },
          options.preset,
        ),
        extractionTimeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = /timeout/i.test(message);
      return {
        ...base,
        ok: false,
        modules,
        failure: makeFailure(
          "extraction",
          timedOut ? "extraction_timeout" : "extractor_threw",
          message,
        ),
        timingsMs,
      };
    }
    mark("extraction", extractedAt);

    // -- artifacts ----------------------------------------------------------
    await mkdir(options.outDir, { recursive: true });
    const screenshotPath = join(options.outDir, "reference.png");
    await page
      .screenshot({ path: screenshotPath, fullPage: false })
      .catch(() => undefined);
    await writeFile(
      join(options.outDir, "extraction.json"),
      JSON.stringify(extraction, null, 2),
      "utf8",
    );

    const signal = hasUsableSignal(extraction);
    if (!signal.colors) {
      return {
        ...base,
        ok: false,
        modules,
        extraction,
        screenshotPath,
        failure: makeFailure("empty", "no_colors", "extraction contains no color values"),
        timingsMs,
      };
    }
    if (!signal.typography) {
      return {
        ...base,
        ok: false,
        modules,
        extraction,
        screenshotPath,
        failure: makeFailure("empty", "no_typography", "extraction contains no font data"),
        timingsMs,
      };
    }

    // -- L2 scoring -----------------------------------------------------------
    // Scoring runs last because it needs the extraction, but it only reads
    // colour strings through a canvas probe and does not depend on page state.
    let accuracy: AccuracyReport | undefined;
    if (truth) {
      try {
        accuracy = await scoreAccuracy(page, extraction, truth);
        await writeFile(
          join(options.outDir, "ground-truth.json"),
          JSON.stringify({ truth, accuracy }, null, 2),
          "utf8",
        );
      } catch (error) {
        truthError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ...base,
      ok: true,
      modules,
      extraction,
      screenshotPath,
      truth,
      accuracy,
      truthError,
      timingsMs,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
