import {
  AIError,
  type AIProvider,
  type AIProviderConfig,
  type AIReply,
  type AIToolCall,
  type ChatMessage,
  type ChatOptions,
} from "./provider";
import { aiFetch, resolveUrl } from "./aiHttp";

// DeepSeek is OpenAI-compatible: POST {baseUrl}/chat/completions with a Bearer
// key. Two modes:
//  - Legacy JSON envelope: pass response_format=json_object and parse the
//    single {message,actions} object from message.content.
//  - Agent / tool-calling: pass tools[] and read choices[0].message.tool_calls.
//    Model MUST call a tool for structural changes → no more "Добавляю…" prose
//    without an action.
export function createDeepSeekProvider(config: AIProviderConfig): AIProvider {
  return {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<AIReply> {
      if (!config.apiKey) throw new AIError("Missing API key", "no-key");

      const url = resolveUrl(config.baseUrl, "/chat/completions");
      // Abort after 60s so a hung connection (e.g. flaky VPN) surfaces as a
      // retryable error instead of an endless "thinking…" state.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      // tools and response_format=json_object are mutually exclusive on
      // OpenAI-compatible APIs — when tools are present, drop JSON mode.
      const useTools = Array.isArray(opts?.tools) && opts.tools.length > 0;
      const jsonMode = opts?.jsonMode !== false && !useTools;

      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: 0.4,
      };
      if (jsonMode) body.response_format = { type: "json_object" };
      if (useTools) {
        body.tools = opts!.tools!.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
        if (opts!.toolChoice && opts!.toolChoice !== "auto") {
          body.tool_choice = opts!.toolChoice;
        }
      }

      let res: Response;
      try {
        res = await aiFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        throw new AIError(
          aborted ? "Request timed out" : err instanceof Error ? err.message : "Network error",
          "network",
        );
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 401 || res.status === 403) {
        throw new AIError("Invalid API key", "auth");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AIError(`HTTP ${res.status}: ${text.slice(0, 200)}`, "network");
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new AIError("Malformed response", "bad-response");
      }

      const message = (data as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: {
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
      })?.choices?.[0]?.message;

      if (!message) throw new AIError("Empty response", "bad-response");

      const text = typeof message.content === "string" ? message.content : "";

      const toolCalls: AIToolCall[] = [];
      for (const tc of message.tool_calls ?? []) {
        const name = tc.function?.name;
        if (!name) continue;
        let args: Record<string, unknown> = {};
        const raw = tc.function?.arguments;
        if (typeof raw === "string" && raw.trim()) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
          } catch {
            /* skip malformed arguments — we'd rather drop the call than crash */
            continue;
          }
        }
        toolCalls.push({ id: tc.id ?? `tc_${toolCalls.length}`, name, arguments: args });
      }

      if (!text && toolCalls.length === 0) {
        throw new AIError("Empty response", "bad-response");
      }
      return { text, toolCalls };
    },
  };
}
