import type { Rgb } from "../eval/color.js";

/**
 * Authorial intent recovered from a page's own CSS custom properties.
 *
 * The benchmark problem this solves: judging whether a design system is *well
 * organised* needs a reference for what the right organisation is, and both
 * obvious sources are bad. Hand annotation is subjective and does not scale;
 * an LLM grader reintroduces the bias and calibration burden that keeping the
 * scorer deterministic was meant to avoid.
 *
 * But designers already publish their intent. A page that declares
 *
 *   --sk-fg-1 .. --sk-fg-4, --sk-bg-1 .. --sk-bg-4, --sk-fg-accent
 *
 * has stated that those eight colours form two families of four elevation
 * steps plus an accent. That structure is invisible in computed styles -- the
 * extractor sees eight unrelated values -- and recovering it from the values
 * alone is exactly the judgement being tested. Using the declarations as the
 * reference makes the target objective without making it mechanical.
 */

export interface ColorVariable {
  readonly name: string;
  readonly raw: string;
  readonly rgb: Rgb;
  /** Family this variable belongs to, e.g. "fg" for --sk-fg-2. */
  readonly family: string;
  /** Position within the family when the name encodes a scale. */
  readonly step?: number;
  /** Role suffix, e.g. "foreground" in --card-foreground. */
  readonly pairedRole?: string;
}

export interface AuthorIntent {
  /** Semantic colour variables, third-party and compiler noise removed. */
  readonly variables: readonly ColorVariable[];
  /** Family name to its member variable names, families of 2+ only. */
  readonly families: ReadonlyMap<string, readonly string[]>;
  /** Surface/foreground pairs, e.g. ["card", "card-foreground"]. */
  readonly pairs: readonly (readonly [string, string])[];
  /** Vocabulary the author used, lowercased, for naming alignment. */
  readonly vocabulary: ReadonlySet<string>;
  /** Variables excluded as third-party or compiler output. */
  readonly rejected: readonly string[];
}

/**
 * Variables that belong to a framework or an embedded widget rather than to
 * the site's own design language. A token set that adopts these has failed to
 * distinguish the design from its dependencies.
 */
const NOISE_PREFIX =
  /^--(?:tw|lightningcss|next|radix|swiper|splide|glide|fa|font-awesome|headlessui|reach|ariakit|docsearch|algolia|toast|sonner|vaul|cmdk)-/i;

/** Names that describe plumbing rather than a colour decision. */
const NON_COLOR_HINT = /margin|padding|width|height|offset|duration|delay|index|transform|radius|spacing|size|weight|family|shadow|stroke/i;

const HEX3 = /^#([0-9a-f]{3})$/i;
const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX8 = /^#([0-9a-f]{8})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;
const HSL_FN = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i;

const NAMED: Readonly<Record<string, [number, number, number]>> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  transparent: [0, 0, 0],
};

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = light - c / 2;
  return {
    r: Math.round(((r1 ?? 0) + m) * 255),
    g: Math.round(((g1 ?? 0) + m) * 255),
    b: Math.round(((b1 ?? 0) + m) * 255),
    a: 1,
  };
}

/**
 * Parse the colour notations that appear in authored stylesheets.
 *
 * Deliberately narrower than the canvas-based parser used for measurement:
 * this runs offline over declarations, and a value it cannot read is skipped
 * rather than guessed. A wrong reference is worse than a smaller one.
 */
export function parseDeclaredColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase();
  if (!value || value.startsWith("var(")) return null;

  const named = NAMED[value];
  if (named) return { r: named[0], g: named[1], b: named[2], a: 1 };

  const hex3 = HEX3.exec(value);
  if (hex3?.[1]) {
    const [r, g, b] = [...hex3[1]].map((ch) => Number.parseInt(ch + ch, 16));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: 1 };
  }
  const hex6 = HEX6.exec(value) ?? HEX8.exec(value);
  if (hex6?.[1]) {
    const n = Number.parseInt(hex6[1].slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = RGB_FN.exec(value);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return {
      r: Math.round(Number.parseFloat(rgb[1])),
      g: Math.round(Number.parseFloat(rgb[2])),
      b: Math.round(Number.parseFloat(rgb[3])),
      a: 1,
    };
  }
  const hsl = HSL_FN.exec(value);
  if (hsl?.[1] && hsl[2] && hsl[3]) {
    return hslToRgb(Number.parseFloat(hsl[1]), Number.parseFloat(hsl[2]), Number.parseFloat(hsl[3]));
  }
  return null;
}

const PAIR_SUFFIX = /^(.*)-(foreground|fg|text|contrast|on)$/;

/**
 * Derive family and step from a variable name.
 *
 * Two conventions cover most real systems: a numeric scale (`--sk-bg-2`,
 * `--gray9`) and a paired role (`--card-foreground`). Both encode grouping
 * that computed values cannot express.
 */
function classifyName(name: string): { family: string; step?: number; pairedRole?: string } {
  // Strip the leading -- and any single-token vendor prefix (--sk-, --bs-).
  let base = name.replace(/^--/, "");
  const prefixed = /^([a-z]{2,4})-(.+)$/i.exec(base);
  if (prefixed?.[2] && /^(sk|bs|ui|ds|app|site)$/i.test(prefixed[1] ?? "")) base = prefixed[2];

  const paired = PAIR_SUFFIX.exec(base);
  if (paired?.[1] && paired[2]) {
    return { family: paired[1], pairedRole: paired[2] };
  }

  // fg-2, gray9, step-03
  const scaled = /^(.*?)-?(\d{1,2})$/.exec(base);
  if (scaled?.[1] && scaled[2] && scaled[1].length > 0) {
    return { family: scaled[1].replace(/-$/, ""), step: Number.parseInt(scaled[2], 10) };
  }

  return { family: base };
}

/**
 * Words worth reusing in token names.
 *
 * The threshold is two characters, not three: `fg` and `bg` are standard
 * vocabulary in real design systems, and excluding them would score a proposal
 * that correctly adopted the author's own abbreviations as having borrowed
 * nothing.
 */
function vocabularyFrom(names: readonly string[]): Set<string> {
  const words = new Set<string>();
  for (const name of names) {
    for (const part of name.replace(/^--/, "").split(/[-_]/)) {
      const word = part.toLowerCase();
      if (word.length >= 2 && !/^\d+$/.test(word)) words.add(word);
    }
  }
  return words;
}

/** Walk any extraction payload collecting declared custom properties. */
export function collectDeclarations(node: unknown, out = new Map<string, string>(), depth = 0): Map<string, string> {
  if (depth > 12 || node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectDeclarations(item, out, depth + 1);
    return out;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith("--") && typeof value === "string" && !out.has(key)) out.set(key, value);
    collectDeclarations(value, out, depth + 1);
  }
  return out;
}

export function readAuthorIntent(extraction: unknown): AuthorIntent {
  const declarations = collectDeclarations(extraction);
  const variables: ColorVariable[] = [];
  const rejected: string[] = [];

  for (const [name, raw] of declarations) {
    if (NOISE_PREFIX.test(name)) {
      rejected.push(name);
      continue;
    }
    if (NON_COLOR_HINT.test(name)) continue;
    const rgb = parseDeclaredColor(raw);
    if (!rgb) continue;
    const { family, step, pairedRole } = classifyName(name);
    variables.push({
      name,
      raw,
      rgb,
      family,
      ...(step !== undefined ? { step } : {}),
      ...(pairedRole !== undefined ? { pairedRole } : {}),
    });
  }

  const byFamily = new Map<string, string[]>();
  for (const variable of variables) {
    byFamily.set(variable.family, [...(byFamily.get(variable.family) ?? []), variable.name]);
  }
  // A family of one is just a colour; grouping only means something at 2+.
  const families = new Map<string, readonly string[]>();
  for (const [family, members] of byFamily) {
    if (members.length >= 2) families.set(family, members);
  }

  const pairs: (readonly [string, string])[] = [];
  const byName = new Map(variables.map((v) => [v.name, v]));
  for (const variable of variables) {
    if (!variable.pairedRole) continue;
    const partner = [...byName.values()].find(
      (other) => !other.pairedRole && other.family === variable.family,
    );
    if (partner) pairs.push([partner.name, variable.name]);
  }

  return {
    variables,
    families,
    pairs,
    vocabulary: vocabularyFrom(variables.map((v) => v.name)),
    rejected,
  };
}
