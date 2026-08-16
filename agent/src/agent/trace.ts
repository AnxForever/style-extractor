import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Append-only execution trace.
 *
 * An agent run that only reports its final answer is unfalsifiable: there is
 * no way to tell a correct result from a lucky one, or to explain a wrong one.
 * Every decision point is recorded as a line of JSON so a run can be replayed,
 * diffed against another run, and attributed when it goes wrong.
 *
 * Timestamps are relative to run start rather than wall-clock, so two traces
 * of the same script diff cleanly.
 */

export type TraceEvent =
  | { readonly type: "run_start"; readonly provider: string; readonly goal: string }
  | { readonly type: "model_request"; readonly turn: number; readonly turns: number }
  | {
      readonly type: "model_response";
      readonly turn: number;
      readonly stopReason: string;
      readonly text: string;
      readonly calls: readonly string[];
      readonly usage: { readonly input: number; readonly output: number };
    }
  | {
      readonly type: "tool_call";
      readonly turn: number;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool_result";
      readonly turn: number;
      readonly name: string;
      readonly isError: boolean;
      readonly bytes: number;
      readonly preview: string;
    }
  | { readonly type: "budget"; readonly turn: number; readonly reason: string }
  | {
      readonly type: "run_end";
      readonly turns: number;
      readonly reason: string;
      readonly usage: { readonly input: number; readonly output: number };
    };

export interface Tracer {
  emit(event: TraceEvent): Promise<void>;
  readonly events: readonly (TraceEvent & { readonly atMs: number })[];
}

export function createTracer(filePath?: string): Tracer {
  const startedAt = performance.now();
  const events: (TraceEvent & { atMs: number })[] = [];
  let ensured = false;

  return {
    events,
    async emit(event) {
      const stamped = { ...event, atMs: Math.round(performance.now() - startedAt) };
      events.push(stamped);
      if (!filePath) return;
      if (!ensured) {
        await mkdir(dirname(filePath), { recursive: true });
        ensured = true;
      }
      // Failure to write a trace must never take down the run it is observing.
      await appendFile(filePath, `${JSON.stringify(stamped)}\n`, "utf8").catch(() => undefined);
    },
  };
}

/** Human-readable summary, for the terminal rather than the trace file. */
export function summarizeTrace(tracer: Tracer): string {
  const lines: string[] = [];
  let input = 0;
  let output = 0;

  for (const event of tracer.events) {
    switch (event.type) {
      case "model_response":
        input += event.usage.input;
        output += event.usage.output;
        lines.push(
          `  [${event.atMs}ms] turn ${event.turn}: ${event.stopReason}` +
            (event.calls.length > 0 ? ` -> ${event.calls.join(", ")}` : ""),
        );
        break;
      case "tool_result":
        lines.push(
          `  [${event.atMs}ms]   ${event.isError ? "ERR " : "ok  "} ${event.name} (${event.bytes}B) ${event.preview}`,
        );
        break;
      case "budget":
        lines.push(`  [${event.atMs}ms] budget: ${event.reason}`);
        break;
      case "run_end":
        lines.push(`  [${event.atMs}ms] end: ${event.reason} after ${event.turns} turns`);
        break;
      default:
        break;
    }
  }
  lines.push(`  tokens: ${input} in / ${output} out`);
  return lines.join("\n");
}
