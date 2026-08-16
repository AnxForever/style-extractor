import Anthropic from "@anthropic-ai/sdk";

/**
 * Model access for the agent loop.
 *
 * The loop is written against this interface rather than against a vendor SDK
 * for two reasons. Agent logic -- planning, tool dispatch, context budgeting,
 * self-correction -- is the part worth testing, and it must be testable
 * without a network or a billing account. And an endpoint is an operational
 * detail: this project's own environment routes through a proxy that
 * rate-limits at the edge, which would otherwise make the whole loop
 * untestable for reasons that have nothing to do with the loop.
 */

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export type Turn =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly text: string; readonly calls: readonly ToolCall[] }
  | { readonly role: "tool_results"; readonly results: readonly ToolResult[] };

export interface ToolResult {
  readonly callId: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface ModelResponse {
  readonly text: string;
  readonly calls: readonly ToolCall[];
  readonly stopReason: string;
  readonly usage: { readonly input: number; readonly output: number };
}

export interface ModelProvider {
  readonly name: string;
  complete(request: {
    readonly system: string;
    readonly turns: readonly Turn[];
    readonly tools: readonly ToolSchema[];
    readonly maxTokens: number;
  }): Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------

function toAnthropicMessages(turns: readonly Turn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
      continue;
    }
    if (turn.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.text.trim()) content.push({ type: "text", text: turn.text });
      for (const call of turn.calls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      // An assistant turn with neither text nor calls is not a valid message.
      messages.push({ role: "assistant", content: content.length > 0 ? content : "..." });
      continue;
    }
    messages.push({
      role: "user",
      content: turn.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.callId,
        content: result.content,
        is_error: result.isError,
      })),
    });
  }
  return messages;
}

export function createAnthropicProvider(options?: {
  readonly model?: string;
  readonly apiKey?: string;
  readonly authToken?: string;
  readonly baseURL?: string;
}): ModelProvider {
  const model =
    options?.model ?? process.env["STYLE_AGENT_MODEL"] ?? "claude-sonnet-5";
  const apiKey = options?.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  const authToken = options?.authToken ?? process.env["ANTHROPIC_AUTH_TOKEN"];

  const client = new Anthropic({
    ...(apiKey ? { apiKey } : {}),
    ...(!apiKey && authToken ? { authToken } : {}),
    ...(options?.baseURL ?? process.env["ANTHROPIC_BASE_URL"]
      ? { baseURL: options?.baseURL ?? process.env["ANTHROPIC_BASE_URL"] }
      : {}),
    maxRetries: 3,
  });

  return {
    name: `anthropic:${model}`,
    async complete({ system, turns, tools, maxTokens }) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
        })),
        messages: toAnthropicMessages(turns),
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const calls = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        }));

      return {
        text,
        calls,
        stopReason: response.stop_reason ?? "unknown",
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------

/** A scripted response for the mock provider. */
export interface MockStep {
  readonly text?: string;
  readonly calls?: readonly { readonly name: string; readonly input: Record<string, unknown> }[];
}

/**
 * Deterministic provider for testing the loop itself.
 *
 * Replays a fixed script of turns. This is what makes it possible to assert
 * that the loop honours its turn cap, feeds tool errors back rather than
 * throwing, and stops when the model stops asking for tools -- none of which
 * should require a live model to verify.
 */
export function createMockProvider(script: readonly MockStep[]): ModelProvider & {
  readonly seen: { turns: readonly Turn[] }[];
} {
  const seen: { turns: readonly Turn[] }[] = [];
  let index = 0;

  return {
    name: "mock",
    seen,
    async complete({ turns }) {
      seen.push({ turns: [...turns] });
      const step = script[index];
      index += 1;
      if (!step) {
        return { text: "done", calls: [], stopReason: "end_turn", usage: { input: 0, output: 0 } };
      }
      const calls = (step.calls ?? []).map((call, i) => ({
        id: `mock-${index}-${i}`,
        name: call.name,
        input: call.input,
      }));
      return {
        text: step.text ?? "",
        calls,
        stopReason: calls.length > 0 ? "tool_use" : "end_turn",
        usage: { input: 10, output: 5 },
      };
    },
  };
}
