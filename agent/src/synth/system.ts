import { colorDistance, type Rgb } from "../eval/color.js";

/**
 * Synthetic design systems with fully known ground truth.
 *
 * The real-site benchmark grades against what a page's authors declared, which
 * works but inherits their choices: Tailwind-compiled sites declare nothing,
 * shadcn reuses one colour across three roles so 21 of its declarations are
 * undecidable, and the sample is however many suitable sites happen to exist.
 *
 * Inverting the direction removes all three limits. Rather than extracting
 * ground truth from a page, generate a page from ground truth. The structure
 * is then known exactly, colours can be forced to stay perceptually distinct
 * so nothing is ambiguous, difficulty becomes a parameter, and the corpus is
 * regenerable -- which is also what makes it resistant to being memorised.
 *
 * Generation is seeded and uses an explicit PRNG rather than Math.random, so a
 * seed always yields the same system and a reported score can be reproduced.
 */

export type FamilyRole = "surface" | "text" | "accent" | "border" | "status";

export interface SynthFamily {
  readonly name: string;
  readonly role: FamilyRole;
  /** Ordered steps, e.g. elevation levels or a tonal ramp. */
  readonly steps: readonly Rgb[];
}

export interface SynthSystem {
  readonly seed: number;
  readonly families: readonly SynthFamily[];
  /** Family name pairs: a surface and the text intended to sit on it. */
  readonly pairs: readonly (readonly [string, string])[];
  readonly fontFamilies: { readonly body: string; readonly heading: string };
  readonly radiusPx: number;
  readonly spacingBasePx: number;
}

/** mulberry32: small, fast, and deterministic given a seed. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round(((r1 ?? 0) + m) * 255),
    g: Math.round(((g1 ?? 0) + m) * 255),
    b: Math.round(((b1 ?? 0) + m) * 255),
    a: 1,
  };
}

export function toHex(color: Rgb): string {
  const part = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

/**
 * Every colour in a generated system must be perceptually distinct from every
 * other. Two families sharing a value is the exact situation that makes the
 * real-site benchmark undecidable, so the generator refuses to produce it.
 */
const MIN_SEPARATION = 6;

function separated(candidate: Rgb, existing: readonly Rgb[]): boolean {
  return existing.every((other) => colorDistance(candidate, other) >= MIN_SEPARATION);
}

const BODY_FONTS = ["Inter", "Source Sans 3", "IBM Plex Sans", "Public Sans"] as const;
const HEADING_FONTS = ["Playfair Display", "Space Grotesk", "Fraunces", "Archivo"] as const;

export interface GenerateOptions {
  readonly seed: number;
  /** Surface and text families each get this many steps. */
  readonly stepsPerFamily?: number;
  /** Additional accent/status families beyond surface and text. */
  readonly extraFamilies?: number;
  readonly dark?: boolean;
}

export function generateSystem(options: GenerateOptions): SynthSystem {
  const rng = makeRng(options.seed);
  const steps = options.stepsPerFamily ?? 4;
  const extras = options.extraFamilies ?? 1;
  const dark = options.dark ?? rng() > 0.5;

  const baseHue = Math.floor(rng() * 360);
  const chroma = 0.04 + rng() * 0.1;
  const used: Rgb[] = [];

  const pushDistinct = (make: (attempt: number) => Rgb): Rgb => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = make(attempt);
      if (separated(candidate, used)) {
        used.push(candidate);
        return candidate;
      }
    }
    // Fall back to a forced-unique value rather than emitting a duplicate,
    // since a duplicate would silently reintroduce ambiguity.
    const forced = hslToRgb(baseHue, chroma, 0.02 + used.length * 0.017);
    used.push(forced);
    return forced;
  };

  // Surfaces: a tight ramp near one end of the lightness range.
  const surfaceSteps: Rgb[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1);
    surfaceSteps.push(
      pushDistinct((attempt) => {
        const lightness = dark ? 0.06 + t * 0.14 : 0.99 - t * 0.11;
        return hslToRgb(baseHue, chroma * 0.6, lightness + attempt * 0.006);
      }),
    );
  }

  // Text: the opposite end, so contrast against surfaces is real.
  const textSteps: Rgb[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1);
    textSteps.push(
      pushDistinct((attempt) => {
        const lightness = dark ? 0.97 - t * 0.32 : 0.08 + t * 0.34;
        return hslToRgb(baseHue, chroma * 0.35, lightness + attempt * 0.008);
      }),
    );
  }

  const families: SynthFamily[] = [
    { name: "surface", role: "surface", steps: surfaceSteps },
    { name: "text", role: "text", steps: textSteps },
  ];

  const extraNames = ["accent", "border", "success", "warning", "danger"] as const;
  const extraRoles: readonly FamilyRole[] = ["accent", "border", "status", "status", "status"];
  for (let i = 0; i < Math.min(extras, extraNames.length); i += 1) {
    const name = extraNames[i];
    const role = extraRoles[i];
    if (!name || !role) continue;
    const hueShift = 40 + i * 65 + rng() * 30;
    const count = role === "accent" ? 2 : 1;
    const stepsForFamily: Rgb[] = [];
    for (let s = 0; s < count; s += 1) {
      stepsForFamily.push(
        pushDistinct((attempt) =>
          hslToRgb(
            baseHue + hueShift,
            role === "border" ? 0.08 : 0.55 + rng() * 0.2,
            (dark ? 0.5 : 0.45) + s * 0.14 + attempt * 0.005,
          ),
        ),
      );
    }
    families.push({ name, role, steps: stepsForFamily });
  }

  return {
    seed: options.seed,
    families,
    pairs: [["surface", "text"]],
    fontFamilies: {
      body: BODY_FONTS[Math.floor(rng() * BODY_FONTS.length)] ?? "Inter",
      heading: HEADING_FONTS[Math.floor(rng() * HEADING_FONTS.length)] ?? "Archivo",
    },
    radiusPx: [0, 2, 4, 8, 12, 16][Math.floor(rng() * 6)] ?? 8,
    spacingBasePx: [4, 8][Math.floor(rng() * 2)] ?? 8,
  };
}

/** Flatten a system to name -> colour, using the canonical token naming. */
export function systemTokens(system: SynthSystem): Map<string, Rgb> {
  const tokens = new Map<string, Rgb>();
  for (const family of system.families) {
    family.steps.forEach((color, index) => {
      const name = family.steps.length === 1 ? family.name : `${family.name}-${index + 1}`;
      tokens.set(name, color);
    });
  }
  return tokens;
}

/**
 * The reference answer, in the shape the judgement scorer expects from a page:
 * a declaration map that states the intended families and steps.
 */
export function systemDeclarations(system: SynthSystem): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [name, color] of systemTokens(system)) {
    declarations.set(`--${name}`, toHex(color));
  }
  return declarations;
}
