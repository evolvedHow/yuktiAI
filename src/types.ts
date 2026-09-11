// ── Domain types ─────────────────────────────────────────────────────────────

export type AgentId = "moderator" | "advocate" | "critic" | "audience";

/**
 * How a debate should be fought. Changes tone, emotional licence, and how the
 * accuracy layers are applied:
 *   - "serious"   real stakes; passionate but disciplined; fabrication is fatal.
 *   - "frivolous" playful; theatrical bias and comic exaggeration allowed, but
 *                 plausible-looking fakery is still rejected.
 */
export type TopicRegister = "serious" | "frivolous";

export const DEFAULT_TOPIC_REGISTER: TopicRegister = "serious";

/** Topics that don't declare a register are treated as serious. */
export function resolveRegister(value: TopicRegister | null | undefined): TopicRegister {
  return value === "frivolous" ? "frivolous" : "serious";
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  /** How the debaters should fight: "serious" (default) or "frivolous". */
  register?: TopicRegister;
  /** Source of the topic: "file" for YAML-loaded topics, "custom" for user-entered */
  source?: "file" | "custom";
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

// ── Fact-checking ────────────────────────────────────────────────────────────

/**
 * Result of actually fetching a URL through the gateway. This is measured, not
 * inferred — an LLM has no way to determine any of it.
 */
export type LinkVerdict =
  | "live"          // server answered with success
  | "missing"       // 404/410 — the fabricated-URL signal
  | "unreachable"   // DNS/TLS/timeout — usually an invented hostname
  | "restricted"    // 401/403/429 — exists, but wouldn't confirm more
  | "server-error"  // site is broken; says nothing about the URL
  | "blocked"       // gateway refused to fetch it
  | "unchecked";    // no gateway configured, so nothing was verified

export interface LinkCheck {
  url: string;
  verdict: LinkVerdict;
  httpStatus?: number;
  finalUrl?: string;
  reason?: string;
}

/** Verdicts that mean the link almost certainly does not exist. */
export const BAD_LINK_VERDICTS: LinkVerdict[] = ["missing", "unreachable"];

export type FindingSeverity = "reject" | "flag";

export type FindingKind =
  | "dead-link"
  | "unverifiable-specific"
  | "misattribution"
  | "overconfident"
  | "contradiction"
  | "strawman";

export interface Finding {
  severity: FindingSeverity;
  kind: FindingKind;
  /** Verbatim span from the statement that the finding refers to. */
  quote: string;
  note: string;
}

export type ReviewVerdict = "clean" | "flagged" | "rejected";

export interface TurnReview {
  verdict: ReviewVerdict;
  /** Findings against the text as it now stands. */
  findings: Finding[];
  /** Link results for the text as it now stands. */
  links: LinkCheck[];
  /** How many times this turn was redone before being accepted. */
  redos: number;
  /**
   * What earlier, rejected attempts were caught on. Without this the audience
   * sees "revised" with no record of what was wrong — which is the part worth
   * showing.
   */
  corrected?: Finding[];
  /** Set when the review itself could not be completed. */
  error?: string;
}

export type ReviewState =
  | "idle"
  | "checking-links"
  | "reviewing"
  | "redoing"
  | "retrying"
  | "done";

export interface Message {
  id: string;
  agent: AgentId;
  content: string;
  turn: number;
  timestamp: string;
  /** true while tokens are still streaming in */
  streaming: boolean;
  /** Populated once the fact-check pass finishes for this turn. */
  review?: TurnReview;
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
  /** false = hold indefinitely until the user clicks through. */
  autoAdvance: boolean;
}

// ── Gateway types ────────────────────────────────────────────────────────────

/** One provider profile as reported by the gateway's GET /providers. */
export interface GatewayProvider {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  /** true when the gateway holds a pre-defined key for this provider. */
  hasServerKey: boolean;
}

export interface GatewayInfo {
  providers: GatewayProvider[];
  defaultProvider: string;
  requiresPasscode: boolean;
}

/** Which key the gateway should spend on our behalf. */
export type KeySource = "server" | "own";

// ── Response reveal (typewriter) ─────────────────────────────────────────────

export interface TypewriterSettings {
  /** false = paint tokens the instant they arrive (original behaviour). */
  enabled: boolean;
  /** Reveal one word at a time (easier to read) or one character at a time. */
  mode: "word" | "char";
  /** Reveal rate in words/sec or chars/sec depending on mode. */
  unitsPerSecond: number;
}

export const TYPEWRITER_PRESETS: { label: string; unitsPerSecond: number }[] = [
  { label: "Slow",   unitsPerSecond: 4 },
  { label: "Normal", unitsPerSecond: 8 },
  { label: "Fast",   unitsPerSecond: 16 },
];

// ── Fact-check settings ──────────────────────────────────────────────────────

export interface FactCheckSettings {
  /** Inject the evidence/sourcing policy into every agent's system prompt. */
  evidencePolicy: boolean;
  /** Fetch every URL an agent cites through the gateway to see if it resolves. */
  verifyLinks: boolean;
  /** Run a reviewer model over each turn. Costs one extra LLM call per turn. */
  reviewClaims: boolean;
  /** How many times a rejected turn may be redone before it is accepted as-is. */
  maxRedos: number;
}

// ── LLM settings (persisted to localStorage) ─────────────────────────────────

export interface LLMSettings {
  /** OpenAI-compatible base URL, no trailing slash.
   *  e.g. https://api.groq.com/openai/v1
   *       https://api.openai.com/v1
   *       https://openrouter.ai/api/v1
   *  Ignored when a gateway is configured. */
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokensPerTurn: number;
  /** Pause between one agent's turn ending and the next LLM call starting. */
  interTurnDelayMs: number;
  /** When false, the debate waits for a manual click instead of counting down. */
  autoAdvance: boolean;
  maxTurns: number;
  /** Gateway URL, no trailing slash — a Cloudflare Worker (see worker/) or the
   *  Python backend. When set, all LLM calls are proxied through it and the key
   *  is held server-side. Leave empty for direct-to-provider mode.
   *  e.g. http://localhost:8787  or  https://yukti-llm-gateway.you.workers.dev */
  backendUrl: string;
  /** Which of the gateway's provider profiles to use. */
  gatewayProviderId: string;
  /** Sent as X-Yukti-Passcode when the gateway requires one. */
  gatewayPasscode: string;
  /** "server" spends the gateway's pre-defined key; "own" sends apiKey instead. */
  keySource: KeySource;
  typewriter: TypewriterSettings;
  factCheck: FactCheckSettings;
}

// Build-time env vars (VITE_* prefix required by Vite).
// Set in .env.local for local dev, or as GitHub Actions variables/secrets for
// Pages deployment. CI substitutes an *empty string* for an unset variable
// rather than omitting it, so `?? fallback` is not enough — these helpers treat
// blank as absent, which is why Number("") can't silently become 0.

function envStr(raw: string | undefined, fallback: string): string {
  return raw && raw.trim() ? raw.trim() : fallback;
}

function envNum(raw: string | undefined, fallback: number): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || !raw.trim()) return fallback;
  return raw.trim().toLowerCase() !== "false";
}

export const DEFAULT_SETTINGS: LLMSettings = {
  baseUrl:           envStr(import.meta.env.VITE_LLM_BASE_URL, "https://api.groq.com/openai/v1"),
  apiKey:            envStr(import.meta.env.VITE_LLM_API_KEY, ""),
  model:             envStr(import.meta.env.VITE_LLM_MODEL, "llama-3.3-70b-versatile"),
  maxTokensPerTurn:  envNum(import.meta.env.VITE_MAX_TOKENS, 420),
  interTurnDelayMs:  envNum(import.meta.env.VITE_TURN_DELAY_MS, 8000),
  autoAdvance:       envBool(import.meta.env.VITE_AUTO_ADVANCE, true),
  maxTurns:          envNum(import.meta.env.VITE_MAX_TURNS, 14),
  backendUrl:        envStr(import.meta.env.VITE_BACKEND_URL, ""),
  gatewayProviderId: envStr(import.meta.env.VITE_GATEWAY_PROVIDER, ""),
  gatewayPasscode:   "",
  keySource:         "server",
  typewriter: {
    enabled:         envBool(import.meta.env.VITE_TYPEWRITER, true),
    mode:            envStr(import.meta.env.VITE_TYPEWRITER_MODE, "word") === "char" ? "char" : "word",
    unitsPerSecond:  envNum(import.meta.env.VITE_TYPEWRITER_RATE, 8),
  },
  factCheck: {
    evidencePolicy:  envBool(import.meta.env.VITE_EVIDENCE_POLICY, true),
    verifyLinks:     envBool(import.meta.env.VITE_VERIFY_LINKS, true),
    reviewClaims:    envBool(import.meta.env.VITE_REVIEW_CLAIMS, true),
    maxRedos:        envNum(import.meta.env.VITE_MAX_REDOS, 1),
  },
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
