// ── Domain types ─────────────────────────────────────────────────────────────

export type AgentId = "moderator" | "advocate" | "critic" | "audience";

export interface Topic {
  id: string;
  title: string;
  description: string;
}

/** Entry in public/topics/index.json */
export interface TopicFileEntry {
  file: string;
  label: string;
}

/** Per-agent config block inside a .yml topic file */
export interface AgentTopicConfig extends Partial<AgentDisplayMeta> {
  /** Extra instructions appended to the agent's base persona for this topic set. */
  persona_overlay?: string;
}

/** Parsed content of a .yml topic file */
export interface TopicFileContent {
  agents?: {
    moderator?: AgentTopicConfig;
    advocate?: AgentTopicConfig;
    critic?: AgentTopicConfig;
  };
  topics: Topic[];
  /** Optional per-file style config. Absent = use session defaults for all agents. */
  style_config?: {
    /** When false, the moderator always speaks plain English regardless of the active style. Default: true. */
    moderator_applies: boolean;
  };
}

// ── Debate Style types ────────────────────────────────────────────────────────

/** Entry in public/styles/index.json */
export interface StyleIndexEntry {
  id: string;
  label: string;
  /** Path to the .md file relative to the styles/ directory, or null for plain English. */
  file: string | null;
}

export interface LanguageModule {
  id: string;
  label: string;
  /** Language pair, e.g. "Hindi–English" */
  pair: string;
  /** Regional register, e.g. "Delhi / Mumbai" */
  region: string;
  /** Script used for romanisation, e.g. "Romanized Hindi" */
  script: string;
  /** Common colloquial expressions */
  colloquials: string[];
  /** Grammar patterns to follow */
  grammar_rules: string[];
}

export interface DebateStyle {
  id: string;
  label: string;
  /**
   * System-prompt block injected into each agent's prompt to drive code-switching.
   * null for plain English (no injection).
   */
  communication_arch: string | null;
  /** Language metadata appended after the arch block. null for plain English. */
  language_module: LanguageModule | null;
  /**
   * Whether the style block is injected for the moderator agent.
   * Defaults to true; overridden per topic file via style_config.moderator_applies.
   */
  moderatorApplies: boolean;
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

export interface AgentDisplayMeta {
  name: string;
  initial: string;
  /** Short personality descriptor shown in the UI, e.g. "Witty & Playful" */
  trait?: string;
}
export type AgentNames = Record<AgentId, AgentDisplayMeta>;

export const DEFAULT_AGENT_NAMES: AgentNames = {
  moderator: { name: "Moderator", initial: "M" },
  advocate:  { name: "Advocate",  initial: "A" },
  critic:    { name: "Critic",    initial: "C" },
  audience:  { name: "Audience",  initial: "?" },
};

export interface GateState {
  active: boolean;
  nextAgent: AgentId | null;
  paused: boolean;
  delayMs: number;
}

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
  /** Optional backend server URL (no trailing slash).
   *  When set, all LLM calls are proxied through this server instead of going
   *  directly to the provider. The API key is managed server-side.
   *  Leave empty to use direct-to-provider mode (GitHub Pages compatible).
   *  e.g. http://localhost:8080  or  https://my-yukti-backend.fly.dev */
  backendUrl: string;
}

// Build-time env vars (VITE_* prefix required by Vite).
// Set in .env.local for local dev, or as GitHub Secrets for Pages deployment.
export const DEFAULT_SETTINGS: LLMSettings = {
  baseUrl:          import.meta.env.VITE_LLM_BASE_URL  ?? "https://api.groq.com/openai/v1",
  apiKey:           import.meta.env.VITE_LLM_API_KEY   ?? "",
  model:            import.meta.env.VITE_LLM_MODEL      ?? "llama-3.3-70b-versatile",
  maxTokensPerTurn: Number(import.meta.env.VITE_MAX_TOKENS   ?? 420),
  interTurnDelayMs: Number(import.meta.env.VITE_TURN_DELAY_MS ?? 8000),
  maxTurns:         Number(import.meta.env.VITE_MAX_TURNS     ?? 14),
  backendUrl:       import.meta.env.VITE_BACKEND_URL   ?? "",
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
