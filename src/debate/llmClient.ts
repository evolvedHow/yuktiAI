/**
 * Thin streaming wrapper around any OpenAI-compatible chat-completions endpoint.
 *
 * Works in the browser via fetch + ReadableStream — no SDK dependency needed.
 * Supported providers: Groq, OpenAI, OpenRouter, Together AI, local Ollama, etc.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Async-generator that yields individual text tokens as they arrive.
 * Throws on network errors or non-2xx HTTP responses.
 */
export async function* streamChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter requires this header
      "HTTP-Referer": window.location.origin,
      "X-Title": "YuktiAI Debate Arena",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.82,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API error ${res.status}: ${body}`);
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
            choices: { delta: { content?: string } }[];
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // malformed SSE chunk — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
