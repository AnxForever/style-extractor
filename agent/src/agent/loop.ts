import { executeTool, scoreProposal, AGENT_TOOLS, type AgentWorkspace, type DtcgGroup, type ProposalScore } from "./tools.js";
import type { ModelProvider, Turn, ToolResult } from "./provider.js";
import type { Tracer } from "./trace.js";

/**
 * The agent loop: plan, act, observe, correct.
 *
 * The extraction engine already produces every value on the page. What it
 * cannot do is decide which of those values represent a design decision --
 * that judgement is why a model is in this pipeline at all, and it is
 * deliberately the only thing the model is asked to do. Measurement stays in
 * code.
 */

export interface LoopOptions {
  readonly provider: ModelProvider;
  readonly workspace: AgentWorkspace;
  readonly tracer: Tracer;
  readonly goal?: string;
  readonly maxTurns?: number;
  readonly maxOutputTokens?: number;
  /** Stop early once the deterministic score reaches this. */
  readonly targetScore?: number;
  /** Full detail kept for this many recent turns; older tool output is elided. */
  readonly detailWindow?: number;
}

export interface LoopResult {
  readonly reason: "goal_reached" | "model_finished" | "turn_budget" | "token_budget" | "error";
  readonly turns: number;
  /** Best proposal seen, which is not necessarily the last one. */
  readonly bestProposal?: DtcgGroup;
  readonly bestScore?: ProposalScore;
  readonly usage: { readonly input: number; readonly output: number };
  readonly error?: string;
}

const SYSTEM = `You extract a design system from measurements of a live web page.

The page has already been analysed; you cannot see it directly. Use the tools
to inspect what was measured, then produce a design token set in W3C DTCG
format.

What matters:
- A design system is a small set of deliberate decisions, not an inventory of
  every colour present. Aim for the handful a developer would actually use.
- Only propose colours that are genuinely painted on the page. Values read from
  stylesheet rules that never rendered are not part of the design.
- Weight your attention by how much of the page a colour covers. The dominant
  surface and text colours matter far more than an incidental border tint.
- CSS variable names carry the authors' own intent. Prefer their vocabulary
  over inventing your own when it is available.
- Give tokens semantic names describing role (surface, text, accent, border),
  not appearance (blue, grey2).

Work iteratively: propose, score, read the specific feedback, and revise. The
score is computed from the page measurements, not from an opinion, so treat its
feedback as fact. Stop when the feedback reports no structural problems, or
when further changes stop improving the score.`;

const DEFAULTS = {
  maxTurns: 12,
  maxOutputTokens: 4096,
  targetScore: 0.9,
  detailWindow: 3,
} as const;

/**
 * Elide the payload of older tool results.
 *
 * Tool output dominates context growth in a loop like this, and stale output
 * is mostly redundant -- the agent has already acted on it. Keeping recent
 * turns verbatim preserves the working set while older turns keep only enough
 * structure for the transcript to stay coherent. Truncating the conversation
 * instead would drop the task framing, which is the one thing that must
 * survive.
 */
function compactTurns(turns: readonly Turn[], detailWindow: number): Turn[] {
  const cutoff = turns.length - detailWindow * 2;
  return turns.map((turn, index) => {
    if (index >= cutoff || turn.role !== "tool_results") return turn;
    return {
      role: "tool_results",
      results: turn.results.map((result) => ({
        callId: result.callId,
        isError: result.isError,
        content:
          result.content.length > 160
            ? `${result.content.slice(0, 160)}... [${result.content.length} chars elided]`
            : result.content,
      })),
    };
  });
}

export async function runAgentLoop(options: LoopOptions): Promise<LoopResult> {
  const {
    provider,
    workspace,
    tracer,
    goal = "Produce a design token set for this page.",
    maxTurns = DEFAULTS.maxTurns,
    maxOutputTokens = DEFAULTS.maxOutputTokens,
    targetScore = DEFAULTS.targetScore,
    detailWindow = DEFAULTS.detailWindow,
  } = options;

  await tracer.emit({ type: "run_start", provider: provider.name, goal });

  const turns: Turn[] = [{ role: "user", content: goal }];
  const usage = { input: 0, output: 0 };
  let bestProposal: DtcgGroup | undefined;
  let bestScore: ProposalScore | undefined;
  let turnCount = 0;

  const finish = async (reason: LoopResult["reason"], error?: string): Promise<LoopResult> => {
    await tracer.emit({ type: "run_end", turns: turnCount, reason, usage: { ...usage } });
    return {
      reason,
      turns: turnCount,
      ...(bestProposal ? { bestProposal } : {}),
      ...(bestScore ? { bestScore } : {}),
      usage: { ...usage },
      ...(error ? { error } : {}),
    };
  };

  while (turnCount < maxTurns) {
    turnCount += 1;
    await tracer.emit({ type: "model_request", turn: turnCount, turns: turns.length });

    let response;
    try {
      response = await provider.complete({
        system: SYSTEM,
        turns: compactTurns(turns, detailWindow),
        tools: AGENT_TOOLS,
        maxTokens: maxOutputTokens,
      });
    } catch (error) {
      // A provider failure ends the run, but whatever the agent already
      // achieved is still returned rather than discarded.
      return finish("error", error instanceof Error ? error.message : String(error));
    }

    usage.input += response.usage.input;
    usage.output += response.usage.output;

    await tracer.emit({
      type: "model_response",
      turn: turnCount,
      stopReason: response.stopReason,
      text: response.text.slice(0, 400),
      calls: response.calls.map((call) => call.name),
      usage: response.usage,
    });

    if (response.calls.length === 0) {
      return finish("model_finished");
    }

    turns.push({ role: "assistant", text: response.text, calls: response.calls });

    const results: ToolResult[] = [];
    for (const call of response.calls) {
      await tracer.emit({ type: "tool_call", turn: turnCount, name: call.name, input: call.input });

      let outcome;
      try {
        outcome = executeTool(workspace, call.name, call.input);
      } catch (error) {
        // Tool faults are reported back to the agent instead of aborting the
        // run. A malformed argument is something it can correct on the next
        // turn; crashing the loop turns a recoverable mistake into a failure.
        outcome = {
          isError: true,
          content: `Tool threw: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      await tracer.emit({
        type: "tool_result",
        turn: turnCount,
        name: call.name,
        isError: outcome.isError,
        bytes: outcome.content.length,
        preview: outcome.content.slice(0, 100).replace(/\n/g, " "),
      });

      results.push({ callId: call.id, content: outcome.content, isError: outcome.isError });

      // Track the best proposal independently of the agent's own trajectory.
      // Iteration is not monotone: a later revision can score worse, and
      // returning the final state would silently discard a better earlier one.
      if (call.name === "propose_tokens" && workspace.proposal) {
        const score = scoreProposal(workspace);
        if (!bestScore || score.score > bestScore.score) {
          bestScore = score;
          bestProposal = JSON.parse(JSON.stringify(workspace.proposal)) as DtcgGroup;
        }
      }
    }

    turns.push({ role: "tool_results", results });

    if (bestScore && bestScore.score >= targetScore) {
      await tracer.emit({
        type: "budget",
        turn: turnCount,
        reason: `target score ${targetScore} reached (${bestScore.score})`,
      });
      return finish("goal_reached");
    }

    if (usage.output >= maxOutputTokens * maxTurns) {
      await tracer.emit({ type: "budget", turn: turnCount, reason: "output token budget exhausted" });
      return finish("token_budget");
    }
  }

  await tracer.emit({ type: "budget", turn: turnCount, reason: `turn cap ${maxTurns} reached` });
  return finish("turn_budget");
}
