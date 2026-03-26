// ── Domain types ─────────────────────────────────────────────────────────────

export type AgentId = "moderator" | "advocate" | "critic" | "audience";

export interface Topic {
  id: string;
  title: string;
  description: string;
}

export interface Message {
  id: string;
  agent: AgentId;
  content: string;
  turn: number;
  timestamp: string;
  /** true while tokens are still streaming in */
  streaming: boolean;
}

export type DebateStatus = "idle" | "active" | "concluding" | "done";

// ── LLM settings (persisted to localStorage) ─────────────────────────────────

export interface LLMSettings {
  /** OpenAI-compatible base URL, no trailing slash.
   *  e.g. https://api.groq.com/openai/v1
   *       https://api.openai.com/v1
   *       https://openrouter.ai/api/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokensPerTurn: number;
  interTurnDelayMs: number;
  maxTurns: number;
}

// Build-time env vars (VITE_* prefix required by Vite).
// Set in .env.local for local dev, or as GitHub Secrets for Pages deployment.
export const DEFAULT_SETTINGS: LLMSettings = {
  baseUrl:          import.meta.env.VITE_LLM_BASE_URL  ?? "https://api.groq.com/openai/v1",
  apiKey:           import.meta.env.VITE_LLM_API_KEY   ?? "",
  model:            import.meta.env.VITE_LLM_MODEL      ?? "llama-3.3-70b-versatile",
  maxTokensPerTurn: Number(import.meta.env.VITE_MAX_TOKENS   ?? 420),
  interTurnDelayMs: Number(import.meta.env.VITE_TURN_DELAY_MS ?? 800),
  maxTurns:         Number(import.meta.env.VITE_MAX_TURNS     ?? 14),
};

export const PROVIDER_PRESETS: { label: string; baseUrl: string; placeholder: string }[] = [
  {
    label: "Groq (free)",
    baseUrl: "https://api.groq.com/openai/v1",
    placeholder: "llama-3.3-70b-versatile",
  },
  {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    placeholder: "gpt-4o-mini",
  },
  {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    placeholder: "meta-llama/llama-3.3-70b-instruct",
  },
  {
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    placeholder: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  },
  {
    label: "Custom / Local",
    baseUrl: "http://localhost:11434/v1",
    placeholder: "llama3.2",
  },
];
