import { toHex, type SynthSystem } from "./system.js";

/**
 * Render a synthetic design system into a real, loadable page.
 *
 * The page has to be genuinely renderable rather than a colour swatch dump:
 * the extraction engine measures painted area, resolves surfaces through
 * transparent ancestors and samples typography from rendered text, so a
 * degenerate page would exercise none of that and the benchmark would measure
 * nothing the real one does.
 *
 * Difficulty is the point of this module. Each level removes a class of clue,
 * which turns "how much judgement does this require" into a parameter instead
 * of an accident of which site was picked.
 */

export type Difficulty =
  /** Semantic custom properties, exactly as a well-run design system ships. */
  | "declared"
  /** Custom properties survive, but their names carry no meaning. */
  | "opaque"
  /** No custom properties at all; values are inlined, as a compiler would emit. */
  | "inlined"
  /** Inlined, plus third-party widget variables and off-system decorative colours. */
  | "noisy";

export const DIFFICULTIES: readonly Difficulty[] = ["declared", "opaque", "inlined", "noisy"];

export interface RenderOptions {
  readonly system: SynthSystem;
  readonly difficulty: Difficulty;
}

/**
 * Deterministic obfuscated name for a token, stable across renders.
 *
 * Uniqueness matters more than brevity here: a collision makes two tokens
 * share one declaration, so one colour silently disappears from the page and
 * the difficulty level ends up measuring a renderer bug instead of a withheld
 * clue. The caller resolves any remaining collision by suffixing.
 */
function opaqueName(token: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (Math.imul(hash, 33) + token.charCodeAt(i)) >>> 0;
  }
  return `--v${hash.toString(36)}`;
}

/** Colours that belong to an embedded widget, not to the design. */
const THIRD_PARTY: readonly (readonly [string, string])[] = [
  ["--docsearch-primary-color", "#5468ff"],
  ["--docsearch-highlight-color", "#5468ff"],
  ["--toast-success-bg", "#22c55e"],
  ["--swiper-pagination-color", "#ff6b35"],
];

interface Resolver {
  /** CSS text to place in :root, empty when values are inlined. */
  readonly rootBlock: string;
  /** Reference a token in a declaration. */
  readonly ref: (token: string) => string;
}

function makeResolver(options: RenderOptions): Resolver {
  const { system, difficulty } = options;
  const entries: string[] = [];
  const map = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const family of system.families) {
    family.steps.forEach((color, index) => {
      const token = family.steps.length === 1 ? family.name : `${family.name}-${index + 1}`;
      const hex = toHex(color);
      if (difficulty === "declared") {
        entries.push(`  --${token}: ${hex};`);
        map.set(token, `var(--${token})`);
      } else if (difficulty === "opaque") {
        let name = opaqueName(token, system.seed);
        let suffix = 0;
        while (usedNames.has(name)) {
          suffix += 1;
          name = `${opaqueName(token, system.seed)}${suffix}`;
        }
        usedNames.add(name);
        entries.push(`  ${name}: ${hex};`);
        map.set(token, `var(${name})`);
      } else {
        map.set(token, hex);
      }
    });
  }

  if (difficulty === "noisy") {
    for (const [name, value] of THIRD_PARTY) entries.push(`  ${name}: ${value};`);
  }

  return {
    rootBlock: entries.length > 0 ? `:root {\n${entries.join("\n")}\n}` : "",
    ref: (token) => map.get(token) ?? "#000000",
  };
}

function familyToken(system: SynthSystem, name: string, step = 1): string {
  const family = system.families.find((f) => f.name === name);
  if (!family) return "surface-1";
  return family.steps.length === 1 ? name : `${name}-${Math.min(step, family.steps.length)}`;
}

const FILLER = [
  "Systems that scale start with decisions you can name.",
  "Every value here exists because something needed it, not because it looked right in isolation.",
  "Consistency is what survives after the third redesign.",
  "A palette is a set of commitments, and commitments are easier to keep when they are written down.",
  "Spacing carries as much meaning as colour once a layout gets dense.",
  "The point of a token is that someone else can use it without asking you what it means.",
  "Naming by role outlives naming by appearance, because roles do not change when values do.",
  "Documentation that nobody reads is still cheaper than a convention nobody agreed to.",
  "Elevation is a language for saying which surface sits above which.",
] as const;

const SPEC_ROWS = [
  ["Contrast", "Body text meets 4.5:1 against its own surface"],
  ["Elevation", "Each step is a distinct surface, not a shadow"],
  ["Motion", "Transitions stay under 200ms for interface feedback"],
  ["Density", "Compact mode reduces spacing, never type size"],
  ["Focus", "Focus rings use the accent, never the border colour"],
] as const;

/**
 * Off-system decorative colours, present only at the noisy level.
 *
 * These paint real area, so an extractor will find them. Separating a
 * deliberate token from an incidental decoration is the judgement this level
 * is meant to test.
 */
const DECORATIVE = ["#8b5cf6", "#f43f5e", "#14b8a6"] as const;

export function renderPage(options: RenderOptions): string {
  const { system, difficulty } = options;
  const r = makeResolver(options);
  const t = (name: string, step = 1): string => r.ref(familyToken(system, name, step));

  const noisy = difficulty === "noisy";
  const space = system.spacingBasePx;
  const radius = system.radiusPx;

  const cards = FILLER.map(
    (text, index) => `
      <article class="card">
        <h3>Principle ${index + 1}</h3>
        <p>${text}</p>
        <a class="card-link" href="#section-${index}">Read more</a>
      </article>`,
  ).join("");

  const decorativeCss = noisy
    ? DECORATIVE.map(
        (color, index) => `
    .decoration-${index} { background: ${color}; height: ${18 + index * 6}px; border-radius: ${radius}px; }`,
      ).join("")
    : "";

  const decorativeMarkup = noisy
    ? DECORATIVE.map((_, index) => `<div class="decoration-${index}"></div>`).join("")
    : "";

  // A swatch strip, the way a real design-system page documents itself. Kept
  // small on purpose: making every token equal in area would erase the
  // area-weighting signal that distinguishes a page surface from an accent.
  const swatches = system.families
    .flatMap((family) =>
      family.steps.map((_, index) => {
        const token = family.steps.length === 1 ? family.name : `${family.name}-${index + 1}`;
        return `<div class="swatch"><span class="chip" style="background: ${r.ref(token)}"></span><code>${token}</code></div>`;
      }),
    )
    .join("");

  const specRows = SPEC_ROWS.map(
    ([label, text]) => `<tr><th scope="row">${label}</th><td>${text}</td></tr>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Synthetic System ${system.seed}</title>
<style>
${r.rootBlock}
* { box-sizing: border-box; }
html { background: ${t("surface", 1)}; }
body {
  margin: 0;
  background: ${t("surface", 1)};
  color: ${t("text", 1)};
  font-family: "${system.fontFamilies.body}", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}
h1, h2, h3 { font-family: "${system.fontFamilies.heading}", Georgia, serif; margin: 0 0 ${space * 2}px; }
h1 { font-size: 56px; line-height: 1.1; }
h2 { font-size: 32px; }
h3 { font-size: 20px; }
p { margin: 0 0 ${space * 2}px; color: ${t("text", 2)}; }

.shell { max-width: 1080px; margin: 0 auto; padding: ${space * 4}px ${space * 3}px; }
.nav {
  display: flex; gap: ${space * 3}px; align-items: center;
  padding: ${space * 2}px ${space * 3}px;
  background: ${t("surface", 2)};
  border-bottom: 1px solid ${t("border", 1)};
}
.nav a { color: ${t("text", 3)}; text-decoration: none; font-size: 14px; }
.nav a.active { color: ${t("text", 1)}; }
.brand { font-weight: 700; color: ${t("text", 1)}; margin-right: auto; }

.hero { padding: ${space * 8}px 0 ${space * 6}px; }
.hero p { font-size: 18px; max-width: 62ch; }
.actions { display: flex; gap: ${space * 2}px; margin-top: ${space * 3}px; }
.btn {
  display: inline-block; padding: ${space * 1.5}px ${space * 3}px;
  border-radius: ${radius}px; font-size: 15px; text-decoration: none; border: 1px solid transparent;
}
.btn-primary { background: ${t("accent", 1)}; color: ${t("surface", 1)}; }
.btn-secondary { background: ${t("surface", 3)}; color: ${t("text", 1)}; border-color: ${t("border", 1)}; }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${space * 3}px; margin: ${space * 6}px 0; }
.card {
  background: ${t("surface", 2)};
  border: 1px solid ${t("border", 1)};
  border-radius: ${radius}px;
  padding: ${space * 3}px;
}
.card p { font-size: 14px; color: ${t("text", 3)}; }
.card-link { color: ${t("accent", 1)}; font-size: 14px; text-decoration: none; }

.panel {
  background: ${t("surface", 4)};
  border-radius: ${radius}px;
  padding: ${space * 4}px;
  margin: ${space * 6}px 0;
}
.footer {
  background: ${t("surface", 2)};
  border-top: 1px solid ${t("border", 1)};
  padding: ${space * 4}px ${space * 3}px;
  color: ${t("text", 4)};
  font-size: 13px;
}
.swatches { display: flex; flex-wrap: wrap; gap: ${space * 2}px; margin: ${space * 3}px 0; }
.swatch { display: flex; align-items: center; gap: ${space}px; font-size: 12px; color: ${t("text", 3)}; }
.chip {
  display: inline-block; width: 20px; height: 20px;
  border-radius: ${Math.min(radius, 4)}px; border: 1px solid ${t("border", 1)};
}
.spec { width: 100%; border-collapse: collapse; margin: ${space * 3}px 0; font-size: 14px; }
.spec th, .spec td { text-align: left; padding: ${space * 1.5}px 0; border-bottom: 1px solid ${t("border", 1)}; }
.spec th { color: ${t("text", 2)}; font-weight: 600; width: 140px; }
.spec td { color: ${t("text", 3)}; }
${decorativeCss}
</style>
</head>
<body>
<nav class="nav">
  <span class="brand">Meridian</span>
  <a class="active" href="#overview">Overview</a>
  <a href="#tokens">Tokens</a>
  <a href="#components">Components</a>
  <a href="#changelog">Changelog</a>
</nav>

<div class="shell">
  <section class="hero">
    <h1>A design system you can hand to someone else</h1>
    <p>Meridian documents the decisions behind an interface so they survive contact with a second contributor, a rebrand, and eighteen months of drift. Nothing here is decorative for its own sake.</p>
    <div class="actions">
      <a class="btn btn-primary" href="#start">Get started</a>
      <a class="btn btn-secondary" href="#docs">Read the docs</a>
    </div>
  </section>

  ${decorativeMarkup}

  <section>
    <h2>Principles</h2>
    <div class="grid">${cards}</div>
  </section>

  <section class="panel">
    <h2>Why tokens</h2>
    <p>A token is a decision with a name. Once it has a name, it can be referenced, audited, and changed in one place instead of forty. The names in this system describe roles rather than appearances, because a role stays true when the value changes and an appearance does not.</p>
    <p>Surfaces are ordered by elevation, text by prominence. Everything else earns its place by being used more than once.</p>
  </section>

  <section>
    <h2>Palette</h2>
    <p>Every value the system defines, in the order it was decided.</p>
    <div class="swatches">${swatches}</div>
  </section>

  <section>
    <h2>Constraints</h2>
    <table class="spec"><tbody>${specRows}</tbody></table>
  </section>
</div>

<footer class="footer">
  <div class="shell">Meridian system, generated for evaluation. Seed ${system.seed}.</div>
</footer>
</body>
</html>`;
}
