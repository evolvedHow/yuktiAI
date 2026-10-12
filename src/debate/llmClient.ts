/**
 * Thin streaming wrapper around any OpenAI-compatible chat-completions endpoint.
 *
 * Works in the browser via fetch + ReadableStream — no SDK dependency needed.
 * Talks to providers directly (Groq, OpenAI, OpenRouter, Together AI, local
 * Ollama, …) or to the YuktiAI gateway, which speaks the same wire format.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** Base URL ending at the version segment, no trailing slash. */
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Defaults to 0.82. The fact-checker uses 0 — a reviewer shouldn't improvise. */
  temperature?: number;
  /** Extra headers — used for the gateway's provider/passcode selection. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Async-generator that yields individual text tokens as they arrive.
 * Throws on network errors, non-2xx responses, or an error event in the stream.
 */
export async function* streamChat(req: ChatRequest): AsyncGenerator<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // OpenRouter requires these; harmless elsewhere.
    "HTTP-Referer": window.location.origin,
    "X-Title": "YuktiAI Debate Arena",
    ...req.headers,
  };

  const res = await fetch(`${req.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.82,
    }),
    signal: req.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API error ${res.status}: ${extractErrorMessage(body) || body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === "[DONE]") return;
        try {
          const json = JSON.parse(raw) as {
            choices?: { delta?: { content?: string } }[];
            error?: unknown;
          };
          // A proxy that fails mid-stream reports it as an SSE error event
          // rather than an HTTP status, since headers are already sent.
          if (json.error) {
            throw new Error(extractErrorMessage(raw) || "upstream stream error");
          }
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch (err) {
          // Re-throw our own error; ignore genuinely malformed SSE chunks.
          if (err instanceof Error && !(err instanceof SyntaxError)) throw err;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Pulls a human-readable message out of an OpenAI-style error payload. */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* not JSON — fall through */
  }
  return "";
}
