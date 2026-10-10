/**
 * Central secret vault integration (worker-env).
 *
 * Provider API keys and the shared access passcode are read from the central
 * `worker-env` Cloudflare Worker vault instead of being set one by one as
 * Worker secrets. That leaves exactly two things for this gateway to hold:
 *
 *   VAULT_URL    — base URL of the vault Worker (plain var, not secret)
 *   VAULT_TOKEN  — bearer token for the vault (a Worker secret)
 *
 * Lookup order for any secret name (e.g. "KEY_GROQ", "ACCESS_PASSCODE"):
 *
 *   1. a plain Worker binding of the same name, if set — a local-dev override
 *      and break-glass path;
 *   2. the vault, fetched over HTTPS and cached in the isolate.
 *
 * A vault that is unreachable, unauthenticated or missing the key resolves to
 * `null` rather than throwing, so the gateway degrades to "no server key" and
 * the app falls back to bring-your-own-key instead of failing every request.
 */

/** Vault context holding this app's secrets. */
export const DEFAULT_VAULT_CONTEXT = "yuktiai";

/** How long a positive vault read is cached in the isolate. */
export const VAULT_HIT_TTL_MS = 5 * 60 * 1000;

/** How long a miss is cached — short, so a newly added secret appears quickly. */
export const VAULT_MISS_TTL_MS = 30 * 1000;

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

/** Isolate-scoped cache: "{context}/{key}" → value. Survives across requests. */
const cache = new Map<string, CacheEntry>();

/** Reads a string binding, treating blank strings as unset. */
function readBinding(env: Record<string, unknown>, name: string): string {
  const raw = env[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

/** Returns the configured vault context, falling back to the default. */
export function vaultContextFor(env: Record<string, unknown>): string {
  return readBinding(env, "VAULT_CONTEXT") || DEFAULT_VAULT_CONTEXT;
}

/**
 * Resolves a secret by name, preferring a direct Worker binding over the vault.
 *
 * @param env - Worker bindings (env in a fetch handler).
 * @param name - Secret name, e.g. "KEY_GROQ" or "ACCESS_PASSCODE".
 * @returns The secret value, or null when it is configured nowhere.
 */
export async function resolveSecret(
  env: Record<string, unknown>,
  name: string,
): Promise<string | null> {
  const direct = readBinding(env, name);
  if (direct) return direct;

  const url = readBinding(env, "VAULT_URL");
  const token = readBinding(env, "VAULT_TOKEN");
  if (!url || !token) return null;

  const context = vaultContextFor(env);
  const cacheKey = `${context}/${name}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await fetchVaultSecret(url, token, context, name);
  const ttl = value === null ? VAULT_MISS_TTL_MS : VAULT_HIT_TTL_MS;
  cache.set(cacheKey, { value, expiresAt: now + ttl });
  return value;
}

/**
 * Fetches one secret from the vault over HTTP. Never throws.
 *
 * @param baseUrl - Vault base URL, with or without a trailing slash.
 * @param token - Bearer token for the vault.
 * @param context - Vault context to read from.
 * @param name - Secret key within the context.
 * @returns The secret value, or null on 404 / auth failure / network error.
 */
async function fetchVaultSecret(
  baseUrl: string,
  token: string,
  context: string,
  name: string,
): Promise<string | null> {
  const endpoint =
    `${baseUrl.replace(/\/+$/, "")}/secrets/` +
    `${encodeURIComponent(context)}/${encodeURIComponent(name)}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(
        JSON.stringify({ message: "vault_error", key: name, status: res.status }),
      );
      return null;
    }

    const data = (await res.json()) as { value?: unknown };
    return typeof data.value === "string" && data.value ? data.value : null;
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "vault_unreachable",
        key: name,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
