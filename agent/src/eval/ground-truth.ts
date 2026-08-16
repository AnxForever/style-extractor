import type { Page } from "playwright";

/**
 * Ground truth collection for L2 accuracy scoring.
 *
 * This module deliberately shares no code with the extraction engine it
 * grades. If the judge reused the extractor's own colour parsing or element
 * selection, every systematic mistake would cancel out and the score would
 * always look good.
 *
 * Two rules keep it trustworthy:
 *  1. Measure, never infer. Ground truth is what the browser actually painted,
 *     not what a design system "should" contain.
 *  2. Rasterize colours through canvas. lab(), oklch(), color-mix() and hex all
 *     collapse to the same RGBA bytes once the browser draws them, which makes
 *     values comparable without reimplementing CSS Color 4.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ColorSample {
  readonly color: Rgb;
  /** Share of sampled viewport area painted with this colour, 0..1. */
  readonly areaShare: number;
}

export interface GroundTruth {
  readonly scheme: "light" | "dark";
  /** The colour a user actually sees behind content, resolved through transparent ancestors. */
  readonly surface: { readonly background: Rgb; readonly foreground: Rgb };
  /** Dominant colours weighted by painted area, most dominant first. */
  readonly palette: readonly ColorSample[];
  /**
   * Every distinct painted colour, unranked and untruncated.
   *
   * Exists to measure precision. The weighted `palette` answers "were the
   * important colours found"; without a full reference set there is no way to
   * ask the opposite question -- whether a claimed colour appears on the page
   * at all -- and an extractor that emits hundreds of values would score
   * perfectly just by covering everything.
   */
  readonly allColors: readonly Rgb[];
  readonly typography: {
    /** Font families actually in use, weighted by rendered text volume. */
    readonly families: readonly string[];
    /** Distinct font sizes in px, ascending. */
    readonly sizeScale: readonly number[];
  };
}

/**
 * Runs inside the page. Written as a single self-contained function because
 * page.evaluate cannot capture anything from the Node scope.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function collectInPage(): Omit<GroundTruth, "scheme"> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  /** Rasterize any CSS colour string into real RGBA bytes. */
  const toRgb = (input: string): { r: number; g: number; b: number; a: number } | null => {
    if (!ctx || !input) return null;
    const trimmed = input.trim();
    if (!trimmed || trimmed === "none") return null;
    ctx.clearRect(0, 0, 1, 1);
    try {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = trimmed;
    } catch {
      return null;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0] ?? 0;
    const g = data[1] ?? 0;
    const b = data[2] ?? 0;
    const a = (data[3] ?? 0) / 255;
    return { r, g, b, a };
  };

  const key = (c: { r: number; g: number; b: number; a: number }): string =>
    `${c.r},${c.g},${c.b},${c.a.toFixed(2)}`;

  // -- surface: walk up until something is actually opaque ------------------
  // body is transparent on a large share of real sites; the painted colour
  // lives on html or an intermediate wrapper. Reading body alone is the single
  // most common way to record a site's background as "transparent black".
  let backgroundEl: Element | null = document.body;
  let background = { r: 255, g: 255, b: 255, a: 1 };
  let depth = 0;
  while (backgroundEl && depth < 8) {
    const parsed = toRgb(getComputedStyle(backgroundEl).backgroundColor);
    if (parsed && parsed.a > 0.05) {
      background = parsed;
      break;
    }
    backgroundEl = backgroundEl.parentElement;
    depth += 1;
  }

  const foreground = toRgb(getComputedStyle(document.body).color) ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };

  /**
   * Flatten a translucent colour onto the page surface.
   *
   * Overlay tints are extremely common (rgba(255,255,255,0.05) hairlines and
   * scrims). Compared as opaque values they read as pure white, which is the
   * opposite of what a viewer sees on a dark page. Compositing against the
   * resolved surface yields the colour that was actually painted.
   */
  const flatten = (c: { r: number; g: number; b: number; a: number }) => {
    if (c.a >= 0.999) return c;
    return {
      r: Math.round(c.r * c.a + background.r * (1 - c.a)),
      g: Math.round(c.g * c.a + background.g * (1 - c.a)),
      b: Math.round(c.b * c.a + background.b * (1 - c.a)),
      a: 1,
    };
  };

  // -- palette + typography over visible elements ---------------------------
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const areaByColor = new Map<string, { color: typeof background; area: number }>();
  const textVolumeByFamily = new Map<string, number>();
  const sizes = new Set<number>();

  const elements = Array.from(document.body.querySelectorAll<HTMLElement>("*")).slice(0, 4000);

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    // Off-screen elements do not contribute to what the design looks like.
    if (rect.bottom < 0 || rect.top > window.innerHeight * 1.5) continue;

    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const opacity = Number.parseFloat(style.opacity || "1");
    if (Number.isFinite(opacity) && opacity < 0.05) continue;

    const area = Math.min(rect.width * rect.height, viewportArea);

    const bg = toRgb(style.backgroundColor);
    if (bg && bg.a > 0.02) {
      const painted = flatten(bg);
      const k = key(painted);
      const entry = areaByColor.get(k);
      if (entry) entry.area += area;
      else areaByColor.set(k, { color: painted, area });
    }

    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? "").trim())
      .join("");

    if (directText.length > 0) {
      const family = (style.fontFamily || "").split(",")[0]?.trim().replace(/^["']|["']$/g, "");
      if (family) {
        textVolumeByFamily.set(family, (textVolumeByFamily.get(family) ?? 0) + directText.length);
      }
      const size = Math.round(Number.parseFloat(style.fontSize || "0"));
      if (size > 0) sizes.add(size);

      const fg = toRgb(style.color);
      if (fg && fg.a > 0.05) {
        const painted = flatten(fg);
        // Text contributes glyph coverage, not full box area.
        const textArea = Math.min(directText.length * size * size * 0.4, area);
        const k = key(painted);
        const entry = areaByColor.get(k);
        if (entry) entry.area += textArea;
        else areaByColor.set(k, { color: painted, area: textArea });
      }
    }
  }

  const totalArea = Array.from(areaByColor.values()).reduce((sum, e) => sum + e.area, 0) || 1;
  const ranked = Array.from(areaByColor.values()).sort((a, b) => b.area - a.area);
  const palette = ranked
    .slice(0, 12)
    .map((e) => ({ color: e.color, areaShare: e.area / totalArea }));
  const allColors = ranked.map((e) => e.color);

  const families = Array.from(textVolumeByFamily.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([family]) => family);

  return {
    surface: { background, foreground },
    palette,
    allColors,
    typography: { families, sizeScale: Array.from(sizes).sort((a, b) => a - b) },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Collect ground truth under an explicitly emulated colour scheme.
 *
 * emulateMedia operates at the CDP level, which is the only way to exercise a
 * prefers-color-scheme site. In-page scripts cannot change a browser-level
 * media feature, so any extractor that runs purely inside the page will report
 * identical values for both themes.
 */
export async function collectGroundTruth(
  page: Page,
  scheme: "light" | "dark",
): Promise<GroundTruth> {
  await page.emulateMedia({ colorScheme: scheme });
  // Theme transitions are frequently animated; sample after they settle.
  await page.waitForTimeout(600);
  const measured = await page.evaluate(collectInPage);
  return { scheme, ...measured };
}

/**
 * Normalise arbitrary CSS colour strings to RGBA by asking the browser.
 *
 * Extracted payloads contain lab(), oklch(), color-mix() and hsl() alongside
 * plain hex. Reimplementing CSS Color 4 parsing in Node to compare them would
 * mean maintaining a second, less correct colour engine -- and any bug in it
 * would show up as a scoring error blamed on the extractor. Rasterizing
 * through the same engine that painted the page removes that whole class of
 * disagreement, and one round trip handles the entire batch.
 */
export async function normalizeColors(
  page: Page,
  colors: readonly string[],
): Promise<(Rgb | null)[]> {
  if (colors.length === 0) return [];
  return page.evaluate((inputs: string[]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return inputs.map(() => null);

    return inputs.map((input) => {
      const trimmed = (input ?? "").trim();
      if (!trimmed) return null;
      // Probe with two different fallbacks: if the string is invalid,
      // fillStyle silently keeps its previous value, so a single probe would
      // report the fallback as a successful parse.
      ctx.fillStyle = "#000000";
      ctx.fillStyle = trimmed;
      const first = ctx.fillStyle;
      ctx.fillStyle = "#ffffff";
      ctx.fillStyle = trimmed;
      if (ctx.fillStyle !== first) return null;

      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
    });
  }, [...colors]);
}
