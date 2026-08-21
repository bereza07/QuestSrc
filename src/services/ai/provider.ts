// AIProvider abstraction (spec §5, §49). The rest of the app depends only on
// this interface, so OpenAI / Anthropic / local LLMs can be added later without
// touching business logic.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProviderConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface ChatOptions {
  /** Ask the model for a strict JSON object (default). Turn off as a fallback
   *  when JSON mode returns empty envelopes — some prompts trip the parser. */
  jsonMode?: boolean;
  /** OpenAI-style tools/functions the model MAY call. When provided, the
   *  provider uses function-calling and returns tool_calls in the result. */
  tools?: AITool[];
  /** How the model should use tools:
   *  - "auto" (default): model decides
   *  - "required": model MUST call at least one tool
   *  - "none": never call tools */
  toolChoice?: "auto" | "required" | "none";
}

/** OpenAI-style function/tool definition. `parameters` is a JSON Schema. */
export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** One tool invocation returned by the model. */
export interface AIToolCall {
  id: string;
  name: string;
  /** Parsed arguments object (JSON-decoded from the model's args string). */
  arguments: Record<string, unknown>;
}

/** Rich reply — text and/or tool calls. Provider always returns both fields. */
export interface AIReply {
  text: string;
  toolCalls: AIToolCall[];
}

export interface AIProvider {
  /**
   * Send a chat and return the model reply.
   * - Legacy path: caller ignores `tools`; provider returns text only.
   * - Agent path: caller passes `tools`; provider returns any tool calls too.
   */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<AIReply>;
}

/** Thrown for any AI failure so the UI can degrade gracefully (spec §61). */
export class AIError extends Error {
  constructor(
    message: string,
    readonly kind: "no-key" | "auth" | "network" | "bad-response" = "network",
  ) {
    super(message);
    this.name = "AIError";
  }
}
