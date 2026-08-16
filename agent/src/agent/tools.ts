import {
  colorDistance,
  deltaToScore,
  paletteCoverage,
  paletteReality,
  harmonicMean,
  JND,
  type Rgb,
  type WeightedColor,
} from "../eval/color.js";
import type { GroundTruth } from "../eval/ground-truth.js";
import type { ToolSchema } from "./provider.js";

/**
 * Tools exposed to the agent.
 *
 * The extraction engine is 23 browser modules, but exposing 23 tools would be
 * a category error: the agent's decisions are about which values constitute a
 * design decision, not about which internal module produced a number. Tool
 * boundaries follow the decision, so the model never has to reason about
 * whether to call motion-assoc or motion-enhanced.
 *
 * Context budget shapes the surface as much as the task does. A full
 * extraction payload runs to hundreds of kilobytes and cannot be handed over
 * wholesale, so every tool returns a bounded, summarised view and the agent
 * pulls detail only where it decides detail is warranted.
 */

export interface DtcgToken {
  readonly $value: string;
  readonly $type?: string;
  readonly $description?: string;
}

export type DtcgGroup = { [key: string]: DtcgToken | DtcgGroup };

export interface ProposalScore {
  readonly coverage: number;
  readonly reality: number;
  readonly convergence: number;
  /** Are the page's background and text colours identified as such by name? */
  readonly roleAccuracy: number;
  /** Do token names describe role, or merely restate appearance/index? */
  readonly semanticNaming: number;
  readonly score: number;
  readonly feedback: readonly string[];
}

export interface AgentWorkspace {
  readonly extraction: unknown;
  readonly truth: { readonly light: GroundTruth; readonly dark: GroundTruth };
  /** Colours from the extraction payload, already normalised to RGB. */
  readonly claimedColors: readonly Rgb[];
  proposal?: DtcgGroup;
  lastScore?: ProposalScore;
}

const MAX_ROWS = 40;

const SURFACE_NAME = /surface|background|\bbg\b|canvas|base/i;
const TEXT_NAME = /\btext\b|foreground|\bfg\b|\bink\b|content/i;

/**
 * Names that carry no design intent.
 *
 * An index (`c0`), a raw hue (`blue`), or a restatement of the value itself
 * tells a consumer nothing about when to use the token. Naming is most of what
 * separates a design system from a list of colours, and it is the part the
 * extraction engine structurally cannot produce -- computed styles carry
 * values, never intent. Scoring it is therefore how the agent's actual
 * contribution becomes visible.
 */
const NON_SEMANTIC_NAME =
  /^(?:c|col|color|colour)?[-_]?\d+$|^(?:red|orange|yellow|green|blue|purple|pink|brown|grey|gray|black|white|cyan|magenta|teal|indigo|violet)[-_]?\d*$|^#?[0-9a-f]{3,8}$/i;

function hex(color: Rgb): string {
  const part = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function parseHex(input: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 };
}

function collectVariables(node: unknown, out: Map<string, string>, depth = 0): void {
  if (depth > 12 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectVariables(item, out, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith("--") && typeof value === "string" && !out.has(key)) {
      out.set(key, value.slice(0, 60));
    }
    collectVariables(value, out, depth + 1);
  }
}

function flattenTokens(group: DtcgGroup, prefix = ""): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const [key, value] of Object.entries(group)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && "$value" in value) {
      out.push({ name, value: String((value as DtcgToken).$value) });
    } else if (value && typeof value === "object") {
      out.push(...flattenTokens(value as DtcgGroup, name));
    }
  }
  return out;
}

/**
 * Deterministic scoring of a proposal.
 *
 * The self-correction signal is computed, not judged by a second model. An LLM
 * grader would import position bias, length bias and self-preference into the
 * one place that must stay trustworthy, and would need calibration against
 * human labels before its numbers meant anything. Feedback is phrased as
 * specific, actionable deltas because a bare score gives the agent nothing to
 * act on.
 */
export function scoreProposal(workspace: AgentWorkspace): ProposalScore {
  const proposal = workspace.proposal;
  if (!proposal) {
    return {
      coverage: 0,
      reality: 0,
      convergence: 0,
      roleAccuracy: 0,
      semanticNaming: 0,
      score: 0,
      feedback: ["No proposal submitted yet. Call propose_tokens first."],
    };
  }

  const flat = flattenTokens(proposal);
  const colors: { name: string; rgb: Rgb }[] = [];
  for (const token of flat) {
    const rgb = parseHex(token.value);
    if (rgb) colors.push({ name: token.name, rgb });
  }

  const feedback: string[] = [];
  if (colors.length === 0) {
    return {
      coverage: 0,
      reality: 0,
      convergence: 0,
      roleAccuracy: 0,
      semanticNaming: 0,
      score: 0,
      feedback: ["Proposal contains no parsable colour tokens. Use 6-digit hex values."],
    };
  }

  const richer =
    workspace.truth.dark.palette.length >= workspace.truth.light.palette.length
      ? workspace.truth.dark
      : workspace.truth.light;
  const truthPalette: WeightedColor[] = richer.palette.map((p) => ({
    color: p.color,
    weight: p.areaShare,
  }));
  const reference = [...workspace.truth.light.allColors, ...workspace.truth.dark.allColors];

  const proposed = colors.map((c) => c.rgb);
  const coverage = paletteCoverage(truthPalette, proposed);
  const reality = paletteReality(proposed, reference);

  // Name the specific dominant colours that were missed, so the next attempt
  // has somewhere to go. A score with no referent is not a correction signal.
  for (const entry of richer.palette.slice(0, 5)) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidate of proposed) {
      nearest = Math.min(nearest, colorDistance(entry.color, candidate));
    }
    if (deltaToScore(nearest) < 0.5) {
      feedback.push(
        `Missing ${hex(entry.color)}, which paints ${(entry.areaShare * 100).toFixed(1)}% of the page.`,
      );
    }
  }

  for (const candidate of colors) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const actual of reference) {
      nearest = Math.min(nearest, colorDistance(candidate.rgb, actual));
    }
    if (deltaToScore(nearest) < 0.5) {
      feedback.push(`Token "${candidate.name}" (${hex(candidate.rgb)}) is not painted anywhere on the page.`);
    }
  }

  // Perceptual duplicates inside the proposal: two names for one decision.
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const a = colors[i];
      const b = colors[j];
      if (!a || !b) continue;
      const delta = colorDistance(a.rgb, b.rgb);
      if (delta < JND) {
        feedback.push(
          `Tokens "${a.name}" and "${b.name}" are perceptually identical (deltaE ${delta.toFixed(1)}); keep one.`,
        );
      }
    }
  }

  // A design system converges. Past ~24 colour tokens it stops being a system
  // and becomes a dump of observed values.
  const convergence = colors.length <= 24 ? 1 : Math.max(0, 1 - (colors.length - 24) / 40);
  if (colors.length > 24) {
    feedback.push(`${colors.length} colour tokens is past what a usable system defines; consolidate.`);
  }

  // -- role accuracy --------------------------------------------------------
  // Identifying which colour is the page surface and which is body text is the
  // minimum a token set must get right; a system that names them wrong is
  // wrong in the way that matters most to whoever consumes it.
  const leaf = (name: string): string => name.split(".").pop() ?? name;
  const truthSurface = richer.surface.background;
  const truthText = richer.surface.foreground;

  const surfaceToken = colors.find((c) => SURFACE_NAME.test(c.name));
  const textToken = colors.find((c) => TEXT_NAME.test(c.name));

  let roleHits = 0;
  if (surfaceToken) {
    const matched = deltaToScore(colorDistance(surfaceToken.rgb, truthSurface)) > 0.5;
    if (matched) roleHits += 1;
    else
      feedback.push(
        `"${surfaceToken.name}" is named as a surface but is ${hex(surfaceToken.rgb)}; the page surface is ${hex(truthSurface)}.`,
      );
  } else {
    feedback.push(`No token names the page surface (${hex(truthSurface)}); add one, e.g. color.surface.`);
  }
  if (textToken) {
    const matched = deltaToScore(colorDistance(textToken.rgb, truthText)) > 0.5;
    if (matched) roleHits += 1;
    else
      feedback.push(
        `"${textToken.name}" is named as text but is ${hex(textToken.rgb)}; body text is ${hex(truthText)}.`,
      );
  } else {
    feedback.push(`No token names the body text colour (${hex(truthText)}); add one, e.g. color.text.`);
  }
  const roleAccuracy = roleHits / 2;

  // -- semantic naming ------------------------------------------------------
  const unnamed = colors.filter((c) => NON_SEMANTIC_NAME.test(leaf(c.name)));
  const semanticNaming = colors.length === 0 ? 0 : 1 - unnamed.length / colors.length;
  if (unnamed.length > 0) {
    feedback.push(
      `${unnamed.length} token(s) named by index or hue rather than role (e.g. "${unnamed[0]?.name}"); name them by purpose.`,
    );
  }

  const score = Number(
    (
      harmonicMean(coverage, reality) * 0.4 +
      roleAccuracy * 0.25 +
      semanticNaming * 0.2 +
      convergence * 0.15
    ).toFixed(3),
  );
  if (feedback.length === 0) feedback.push("No structural problems found.");

  return {
    coverage: Number(coverage.toFixed(3)),
    reality: Number(reality.toFixed(3)),
    convergence: Number(convergence.toFixed(3)),
    roleAccuracy: Number(roleAccuracy.toFixed(3)),
    semanticNaming: Number(semanticNaming.toFixed(3)),
    score,
    feedback: feedback.slice(0, 12),
  };
}

// ---------------------------------------------------------------------------

export const AGENT_TOOLS: readonly ToolSchema[] = [
  {
    name: "survey",
    description:
      "Statistics about the extracted page: colour counts, variable counts, fonts, and the dominant surface colours. Start here. Returns no raw data.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_colors",
    description:
      "Colours actually painted on the page, ordered by the share of area they cover. Use this to find the decisions that matter.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: `Max rows, default 20, cap ${MAX_ROWS}.` },
        minSharePct: { type: "number", description: "Only colours covering at least this percent of area." },
      },
    },
  },
  {
    name: "list_variables",
    description:
      "CSS custom properties declared by the page, with values. Useful for recovering the authors' own naming, which computed styles do not carry.",
    input_schema: {
      type: "object",
      properties: {
        contains: { type: "string", description: "Substring filter on the variable name." },
        limit: { type: "number", description: `Max rows, default 20, cap ${MAX_ROWS}.` },
      },
    },
  },
  {
    name: "check_color",
    description:
      "Check whether a specific colour is actually painted on the page, and how much area it covers. Use before proposing a colour you are unsure about.",
    input_schema: {
      type: "object",
      properties: { hex: { type: "string", description: "6-digit hex, e.g. #0d1117" } },
      required: ["hex"],
    },
  },
  {
    name: "propose_tokens",
    description:
      "Submit a design token set in W3C DTCG format. Colour values must be 6-digit hex. Submitting replaces any previous proposal.",
    input_schema: {
      type: "object",
      properties: {
        tokens: {
          type: "object",
          description:
            'DTCG groups, e.g. {"color":{"surface":{"$value":"#030712","$type":"color"}}}',
        },
      },
      required: ["tokens"],
    },
  },
  {
    name: "score_proposal",
    description:
      "Score the current proposal against what the page actually paints. Returns coverage, reality, convergence and specific problems to fix. Deterministic; call it as often as useful.",
    input_schema: { type: "object", properties: {} },
  },
] as const;

export interface ToolOutcome {
  readonly content: string;
  readonly isError: boolean;
}

export function executeTool(
  workspace: AgentWorkspace,
  name: string,
  input: Record<string, unknown>,
): ToolOutcome {
  const clampLimit = (value: unknown, fallback: number): number => {
    const parsed = typeof value === "number" ? value : fallback;
    return Math.max(1, Math.min(MAX_ROWS, Math.floor(parsed)));
  };

  switch (name) {
    case "survey": {
      const richer =
        workspace.truth.dark.palette.length >= workspace.truth.light.palette.length
          ? workspace.truth.dark
          : workspace.truth.light;
      const variables = new Map<string, string>();
      collectVariables(workspace.extraction, variables);
      const top = richer.palette
        .slice(0, 3)
        .map((p) => `${hex(p.color)} (${(p.areaShare * 100).toFixed(1)}%)`)
        .join(", ");
      return {
        isError: false,
        content: [
          `painted colours: ${richer.allColors.length}`,
          `colours claimed by extractor: ${workspace.claimedColors.length}`,
          `css variables declared: ${variables.size}`,
          `fonts in use: ${richer.typography.families.join(", ") || "none detected"}`,
          `font sizes: ${richer.typography.sizeScale.join(", ") || "none"}`,
          `dominant surfaces: ${top}`,
          `page background: ${hex(richer.surface.background)}, text: ${hex(richer.surface.foreground)}`,
        ].join("\n"),
      };
    }

    case "list_colors": {
      const limit = clampLimit(input["limit"], 20);
      const minShare = typeof input["minSharePct"] === "number" ? input["minSharePct"] / 100 : 0;
      const richer =
        workspace.truth.dark.palette.length >= workspace.truth.light.palette.length
          ? workspace.truth.dark
          : workspace.truth.light;
      const rows = richer.palette
        .filter((p) => p.areaShare >= minShare)
        .slice(0, limit)
        .map((p) => `${hex(p.color)}  ${(p.areaShare * 100).toFixed(2)}%`);
      const omitted = richer.palette.length - rows.length;
      return {
        isError: false,
        content:
          rows.length === 0
            ? "No colours match that filter."
            : `${rows.join("\n")}${omitted > 0 ? `\n(${omitted} more not shown)` : ""}`,
      };
    }

    case "list_variables": {
      const limit = clampLimit(input["limit"], 20);
      const contains = typeof input["contains"] === "string" ? input["contains"].toLowerCase() : "";
      const variables = new Map<string, string>();
      collectVariables(workspace.extraction, variables);
      const matching = [...variables.entries()].filter(([key]) =>
        contains ? key.toLowerCase().includes(contains) : true,
      );
      const rows = matching.slice(0, limit).map(([key, value]) => `${key}: ${value}`);
      const omitted = matching.length - rows.length;
      return {
        isError: false,
        content:
          rows.length === 0
            ? "No variables match that filter."
            : `${rows.join("\n")}${omitted > 0 ? `\n(${omitted} more not shown)` : ""}`,
      };
    }

    case "check_color": {
      const raw = input["hex"];
      if (typeof raw !== "string") {
        return { isError: true, content: "check_color requires a 'hex' string." };
      }
      const rgb = parseHex(raw);
      if (!rgb) {
        return { isError: true, content: `Could not parse "${raw}". Use 6-digit hex like #0d1117.` };
      }
      const richer =
        workspace.truth.dark.palette.length >= workspace.truth.light.palette.length
          ? workspace.truth.dark
          : workspace.truth.light;
      let nearest = Number.POSITIVE_INFINITY;
      let nearestColor: Rgb | null = null;
      for (const actual of [...workspace.truth.light.allColors, ...workspace.truth.dark.allColors]) {
        const distance = colorDistance(rgb, actual);
        if (distance < nearest) {
          nearest = distance;
          nearestColor = actual;
        }
      }
      const sample = richer.palette.find((p) => colorDistance(p.color, rgb) <= JND);
      if (nearest <= JND) {
        return {
          isError: false,
          content: `Painted on the page.${sample ? ` Covers ${(sample.areaShare * 100).toFixed(2)}% of area.` : " Minor usage."}`,
        };
      }
      return {
        isError: false,
        content: `Not painted. Nearest actual colour is ${nearestColor ? hex(nearestColor) : "unknown"} (deltaE ${nearest.toFixed(1)}).`,
      };
    }

    case "propose_tokens": {
      const tokens = input["tokens"];
      if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
        return { isError: true, content: "propose_tokens requires a 'tokens' object in DTCG shape." };
      }
      workspace.proposal = tokens as DtcgGroup;
      const flat = flattenTokens(workspace.proposal);
      if (flat.length === 0) {
        return {
          isError: true,
          content: 'No tokens found. Each leaf needs a $value, e.g. {"color":{"bg":{"$value":"#030712"}}}',
        };
      }
      return { isError: false, content: `Recorded ${flat.length} tokens. Call score_proposal to check them.` };
    }

    case "score_proposal": {
      const score = scoreProposal(workspace);
      workspace.lastScore = score;
      return {
        isError: false,
        content: [
          `score: ${score.score}  (coverage ${score.coverage}, reality ${score.reality}, convergence ${score.convergence})`,
          ...score.feedback.map((line) => `- ${line}`),
        ].join("\n"),
      };
    }

    default:
      return { isError: true, content: `Unknown tool "${name}".` };
  }
}
