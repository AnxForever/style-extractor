import type { ModelProvider, Turn, ToolCall } from "./provider.js";

/**
 * A rule-based agent that performs the same task without a model.
 *
 * This exists to answer a question that is usually assumed rather than tested:
 * is the model earning its place? Naming a design system is a judgement call,
 * but a decent share of it is mechanical -- the largest painted colour is
 * almost always the surface, body text is whatever the page reports as its
 * foreground, and the most chromatic remaining colour is usually the accent.
 * If simple rules score as well as the model, the model is decoration.
 *
 * It implements ModelProvider so it drops into the same loop, obeys the same
 * budgets, and is graded by the same scorer. The only difference is where the
 * decisions come from.
 */

interface ParsedColor {
  readonly hex: string;
  readonly sharePct: number;
}

function lastToolText(turns: readonly Turn[], toolName: string, calls: Map<string, string>): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn?.role !== "tool_results") continue;
    for (const result of turn.results) {
      if (calls.get(result.callId) === toolName) return result.content;
    }
  }
  return null;
}

/** Map tool_use ids back to tool names, since results carry only the id. */
function callIndex(turns: readonly Turn[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const call of turn.calls) index.set(call.id, call.name);
  }
  return index;
}

function parseColorRows(text: string): ParsedColor[] {
  const rows: ParsedColor[] = [];
  for (const line of text.split("\n")) {
    const match = /^(#[0-9a-f]{6})\s+([\d.]+)%/i.exec(line.trim());
    if (match?.[1] && match[2]) {
      rows.push({ hex: match[1].toLowerCase(), sharePct: Number.parseFloat(match[2]) });
    }
  }
  return rows;
}

function parseSurfaceAndText(surveyText: string): { surface?: string; text?: string } {
  const match = /page background: (#[0-9a-f]{6}), text: (#[0-9a-f]{6})/i.exec(surveyText);
  return match?.[1] && match[2]
    ? { surface: match[1].toLowerCase(), text: match[2].toLowerCase() }
    : {};
}

/** Rough chroma proxy: distance between the brightest and dimmest channel. */
function colorfulness(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function createHeuristicProvider(): ModelProvider {
  let step = 0;

  return {
    name: "heuristic",
    async complete({ turns }) {
      step += 1;
      const index = callIndex(turns);
      const mk = (name: string, input: Record<string, unknown>): ToolCall => ({
        id: `heuristic-${step}`,
        name,
        input,
      });
      const usage = { input: 0, output: 0 };

      if (step === 1) {
        return { text: "", calls: [mk("survey", {})], stopReason: "tool_use", usage };
      }
      if (step === 2) {
        return {
          text: "",
          calls: [mk("list_colors", { limit: 12 })],
          stopReason: "tool_use",
          usage,
        };
      }
      if (step === 3) {
        const surveyText = lastToolText(turns, "survey", index) ?? "";
        const colorsText = lastToolText(turns, "list_colors", index) ?? "";
        const { surface, text } = parseSurfaceAndText(surveyText);
        const rows = parseColorRows(colorsText);

        const tokens: Record<string, { $value: string; $type: string; $description?: string }> = {};
        if (surface) {
          tokens["surface"] = { $value: surface, $type: "color", $description: "page background" };
        }
        if (text) {
          tokens["text"] = { $value: text, $type: "color", $description: "body text" };
        }

        // Everything that is not the surface or the text: the most chromatic
        // becomes the accent, the rest become muted steps ordered by area.
        const taken = new Set([surface, text].filter(Boolean) as string[]);
        const remaining = rows.filter((row) => !taken.has(row.hex));
        const byChroma = [...remaining].sort((a, b) => colorfulness(b.hex) - colorfulness(a.hex));

        const accent = byChroma[0];
        if (accent && colorfulness(accent.hex) > 20) {
          tokens["accent"] = { $value: accent.hex, $type: "color", $description: "primary accent" };
          taken.add(accent.hex);
        }

        let muted = 1;
        for (const row of remaining) {
          if (taken.has(row.hex) || muted > 4) continue;
          tokens[`muted${muted}`] = {
            $value: row.hex,
            $type: "color",
            $description: `secondary surface, ${row.sharePct}% of page`,
          };
          taken.add(row.hex);
          muted += 1;
        }

        return {
          text: "",
          calls: [mk("propose_tokens", { tokens: { color: tokens } })],
          stopReason: "tool_use",
          usage,
        };
      }
      if (step === 4) {
        return { text: "", calls: [mk("score_proposal", {})], stopReason: "tool_use", usage };
      }

      // Rules do not iterate. Stopping here is the honest behaviour: the
      // difference between this score and the model's is the model's
      // contribution, and hand-tuning the rules against the scorer until they
      // match would make that comparison meaningless.
      return { text: "Heuristic pass complete.", calls: [], stopReason: "end_turn", usage };
    },
  };
}
