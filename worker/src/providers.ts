/**
 * Provider catalogue for the YuktiAI LLM gateway.
 *
 * A "provider profile" is a named OpenAI-compatible endpoint. The gateway holds
 * one API key per profile as a Worker secret, so the browser never sees a key.
 *
 * There are three ways a profile can exist:
 *
 *   1. Built-in      — listed in BUILTIN_PROFILES below.
 *   2. Env-defined   — added at deploy time via the EXTRA_PROVIDERS var (JSON
 *                      array of profiles). Entries with an existing id override
 *                      the built-in of the same id.
 *   3. Caller-supplied key — any profile can be used with a key sent by the
 *                      browser (BYOK) instead of the server-held one.
 *
 * Secret naming convention (see secretNameFor):
 *   profile id "groq"        → secret KEY_GROQ
 *   profile id "my-llama.2"  → secret KEY_MY_LLAMA_2
 *
 * The base URL of any profile can also be overridden per-deployment with
 * BASE_URL_<SLUG> (same slug rules), which is how you point a profile at a
 * self-hosted or regional endpoint without touching this file.
 */

export interface ProviderProfile {
  /** Stable identifier — also drives the secret name. */
  id: string;
  /** Human label shown in the app's settings UI. */
  label: string;
  /** OpenAI-compatible base URL, no trailing slash. "/chat/completions" is appended. */
  baseUrl: string;
  /** Model pre-filled in the UI when this profile is picked. */
  defaultModel: string;
  /** Optional shortlist of models offered in the UI. */
  models?: string[];
}

export const BUILTIN_PROFILES: ProviderProfile[] = [
    {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "groq/compound-mini",
        models: ["groq/compound-mini"],
    },
    {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        models: ["gpt-4o-mini", "gpt-4o"],
    },
    {
        id: "anthropic",
        label: "Anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        defaultModel: "claude-sonnet-5",
        models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    },
    {
        id: "openrouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "meta-llama/llama-3.3-70b-instruct",
    },
    {
        id: "together",
        label: "Together AI",
        baseUrl: "https://api.together.xyz/v1",
        defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    },
    {
        id: "cerebras",
        label: "Cerebras",
        baseUrl: "https://api.cerebras.ai/v1",
        defaultModel: "llama-3.3-70b",
    },
    {
        id: "google",
        label: "Google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/interactions",
        defaultModel: "gemini-2.5-flash",
        models: ["gemini-2.5-flash","gemini-3.5-flash", "gemini-3.8-flash"],
    },
];




/** "my-llama.2" → "MY_LLAMA_2" */
export function slugFor(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function secretNameFor(id: string): string {
  return `KEY_${slugFor(id)}`;
}

export function baseUrlVarFor(id: string): string {
  return `BASE_URL_${slugFor(id)}`;
}

/** Parses the EXTRA_PROVIDERS var. Malformed entries are dropped, not fatal. */
export function parseExtraProfiles(raw: string | undefined): ProviderProfile[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(JSON.stringify({ message: "EXTRA_PROVIDERS is not valid JSON — ignored" }));
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(JSON.stringify({ message: "EXTRA_PROVIDERS must be a JSON array — ignored" }));
    return [];
  }

  const out: ProviderProfile[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.baseUrl !== "string") continue;
    out.push({
      id: e.id,
      label: typeof e.label === "string" ? e.label : e.id,
      baseUrl: e.baseUrl.replace(/\/+$/, ""),
      defaultModel: typeof e.defaultModel === "string" ? e.defaultModel : "",
      models: Array.isArray(e.models) ? e.models.filter((m): m is string => typeof m === "string") : undefined,
    });
  }
  return out;
}

/** Built-ins merged with EXTRA_PROVIDERS; later entries win on id collision. */
export function resolveProfiles(extraRaw: string | undefined): ProviderProfile[] {
  const byId = new Map<string, ProviderProfile>();
  for (const p of BUILTIN_PROFILES) byId.set(p.id, p);
  for (const p of parseExtraProfiles(extraRaw)) byId.set(p.id, { ...byId.get(p.id), ...p });
  return [...byId.values()];
}
