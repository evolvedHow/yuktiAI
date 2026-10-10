/**
 * YuktiAI LLM Gateway — Cloudflare Worker.
 *
 * Holds provider API keys server-side so the debate arena (a static site) never
 * ships a key in its bundle. Speaks the OpenAI chat-completions wire format, so
 * the frontend talks to it exactly the way it talks to any provider.
 *
 * Secrets (provider keys and the access passcode) are read from the central
 * worker-env vault — see vault.ts. Only VAULT_URL and VAULT_TOKEN are held here;
 * a direct binding of the same name still overrides the vault for local dev.
 *
 * Routes
 *   OPTIONS *                  CORS preflight
 *   GET     /health            liveness + provider count
 *   GET     /providers         profile list with hasServerKey flags (no secrets)
 *   POST    /v1/chat/completions
 *
 * Request headers understood by /v1/chat/completions
 *   X-Yukti-Provider   profile id (falls back to body.provider, then DEFAULT_PROVIDER)
 *   X-Yukti-Passcode   required when the ACCESS_PASSCODE secret is set
 *   Authorization      optional "Bearer <key>" — bring-your-own-key. When present
 *                      it is used instead of the server-held key for that profile.
 *
 * See providers.ts for how profiles and their secrets are named.
 */

import {
  ProviderProfile,
  baseUrlVarFor,
  resolveProfiles,
  secretNameFor,
} from "./providers";
import { resolveSecret, vaultContextFor } from "./vault";
import { MAX_URLS, verifyLinks } from "./verifyLinks";

/**
 * Bindings are declared by hand rather than via `wrangler types` because the
 * per-provider key secrets (KEY_GROQ, KEY_OPENAI, …) are deliberately dynamic —
 * adding a provider must not require a code change. Everything except the
 * rate-limit binding is a plain string.
 */
interface KnownBindings {
  /** Comma-separated origin allowlist, or "*" (default). */
  ALLOWED_ORIGINS?: string;
  /** When set, callers must send a matching X-Yukti-Passcode on /v1/*. */
  ACCESS_PASSCODE?: string;
  /** Base URL of the worker-env vault serving this app's provider keys. */
  VAULT_URL?: string;
  /** Bearer token for the vault (set via `wrangler secret put VAULT_TOKEN`). */
  VAULT_TOKEN?: string;
  /** Vault context holding this app's secrets. Defaults to "yuktiai". */
  VAULT_CONTEXT?: string;
  /** JSON array of extra ProviderProfile entries. */
  EXTRA_PROVIDERS?: string;
  /** Profile used when the caller does not name one. */
  DEFAULT_PROVIDER?: string;
  /** Optional; configured under "ratelimits" in wrangler.jsonc. */
  RATE_LIMITER?: RateLimit;
}

export type Env = KnownBindings & Record<string, string | RateLimit | undefined>;

/** Reject oversized bodies before parsing — debate history is well under this. */
const MAX_BODY_BYTES = 1_000_000;

const ALLOWED_REQUEST_HEADERS =
  "authorization, content-type, x-yukti-provider, x-yukti-passcode, http-referer, x-title";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(env, request.headers.get("Origin"));

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const { pathname } = new URL(request.url);
      const route = `${request.method} ${pathname}`;

      if (route === "GET /health") return await handleHealth(env, cors);
      if (route === "GET /providers") return await handleProviders(env, cors);
      if (route === "POST /verify-links") return await handleVerifyLinks(request, env, cors);
      if (route === "POST /v1/chat/completions") return await handleChat(request, env, cors);

      return errorResponse(404, "Not found", cors);
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "unhandled_gateway_error",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return errorResponse(500, "Gateway error", cors);
    }
  },
} satisfies ExportedHandler<Env>;

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleHealth(env: Env, cors: Headers): Promise<Response> {
  const profiles = resolveProfiles(env.EXTRA_PROVIDERS);
  const keys = await Promise.all(profiles.map((p) => serverKeyFor(env, p.id)));
  const passcode = await accessPasscodeFor(env);
  return jsonResponse(
    {
      ok: true,
      service: "yukti-llm-gateway",
      providers: profiles.length,
      providersWithServerKey: keys.filter((key) => key !== null).length,
      requiresPasscode: Boolean(passcode),
    },
    200,
    cors,
  );
}

async function handleProviders(env: Env, cors: Headers): Promise<Response> {
  const profiles = resolveProfiles(env.EXTRA_PROVIDERS);
  const passcode = await accessPasscodeFor(env);
  const providers = await Promise.all(
    profiles.map(async (p) => ({
      id: p.id,
      label: p.label,
      baseUrl: effectiveBaseUrl(env, p),
      defaultModel: p.defaultModel,
      models: p.models ?? [],
      // Only ever a boolean — the key itself never leaves the Worker.
      hasServerKey: (await serverKeyFor(env, p.id)) !== null,
    })),
  );
  return jsonResponse(
    {
      defaultProvider: env.DEFAULT_PROVIDER ?? profiles[0]?.id ?? "",
      requiresPasscode: Boolean(passcode),
      providers,
    },
    200,
    cors,
  );
}

/**
 * Fetches each supplied URL and reports what the server said. Used by the
 * transcript's fact-check pass to tell a real citation from an invented one.
 */
async function handleVerifyLinks(request: Request, env: Env, cors: Headers): Promise<Response> {
  const denied = await guardRequest(request, env, cors);
  if (denied) return denied;

  let body: { urls?: unknown };
  try {
    body = (await request.json()) as { urls?: unknown };
  } catch {
    return errorResponse(400, "Request body is not valid JSON.", cors);
  }

  if (!Array.isArray(body.urls)) {
    return errorResponse(400, 'Expected { "urls": [ … ] }.', cors);
  }

  const urls = body.urls.filter((u): u is string => typeof u === "string");
  const results = await verifyLinks(urls);

  console.log(
    JSON.stringify({
      message: "verify_links",
      requested: urls.length,
      checked: results.length,
      missing: results.filter((r) => r.verdict === "missing" || r.verdict === "unreachable").length,
    }),
  );

  return jsonResponse({ results, maxUrls: MAX_URLS }, 200, cors);
}

/** Passcode + rate-limit checks shared by every endpoint that costs us money. */
async function guardRequest(request: Request, env: Env, cors: Headers): Promise<Response | null> {
  const passcode = await accessPasscodeFor(env);
  if (passcode) {
    const supplied = request.headers.get("X-Yukti-Passcode") ?? "";
    if (!(await constantTimeEquals(supplied, passcode))) {
      return errorResponse(401, "Invalid or missing passcode.", cors);
    }
  }

  if (env.RATE_LIMITER) {
    const key = request.headers.get("CF-Connecting-IP") ?? "anonymous";
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) {
      return errorResponse(429, "Rate limit exceeded — please slow down.", cors);
    }
  }

  return null;
}

async function handleChat(request: Request, env: Env, cors: Headers): Promise<Response> {
  const denied = await guardRequest(request, env, cors);
  if (denied) return denied;

  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body too large.", cors);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return errorResponse(400, "Request body must be a JSON object.", cors);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, "Request body is not valid JSON.", cors);
  }

  // Provider selection: header wins, then a "provider" field in the body, then
  // the deployment default. The field is stripped before forwarding upstream.
  const bodyProvider = typeof body.provider === "string" ? body.provider : "";
  delete body.provider;
  const providerId = (
    request.headers.get("X-Yukti-Provider") ||
    bodyProvider ||
    env.DEFAULT_PROVIDER ||
    ""
  ).trim();

  const profiles = resolveProfiles(env.EXTRA_PROVIDERS);
  const profile = profiles.find((p) => p.id === providerId) ?? (providerId ? undefined : profiles[0]);
  if (!profile) {
    return errorResponse(
      400,
      `Unknown provider "${providerId}". Known providers: ${profiles.map((p) => p.id).join(", ")}.`,
      cors,
    );
  }

  // A caller that leaves the model blank falls back to the profile's default.
  // The frontend ships a blank model while it hasn't been typed into the vault,
  // so this is what makes "leave it empty" actually use the default.
  if (typeof body.model !== "string" || !body.model.trim()) {
    body.model = profile.defaultModel;
  }

  const callerKey = bearerToken(request.headers.get("Authorization"));
  const apiKey = callerKey ?? (await serverKeyFor(env, profile.id));
  if (!apiKey) {
    return errorResponse(
      400,
      `No API key available for "${profile.id}". Add the ${secretNameFor(profile.id)} secret ` +
        `to the vault context "${vaultContextFor(env)}", or send your own key as an ` +
        `Authorization: Bearer header.`,
      cors,
    );
  }

  const upstreamUrl = `${effectiveBaseUrl(env, profile)}/chat/completions`;
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter attributes traffic with these; harmless elsewhere.
      "HTTP-Referer": request.headers.get("HTTP-Referer") ?? "https://yuktiai.local",
      "X-Title": request.headers.get("X-Title") ?? "YuktiAI Debate Arena",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    // Error bodies are small; the streaming path below never buffers.
    const detail = (await upstream.text()).slice(0, 2000);
    console.error(
      JSON.stringify({
        message: "upstream_error",
        provider: profile.id,
        status: upstream.status,
        keySource: callerKey ? "caller" : "server",
      }),
    );
    return jsonResponse(
      {
        error: {
          message: `${profile.label} returned ${upstream.status}`,
          provider: profile.id,
          detail,
        },
      },
      upstream.status,
      cors,
    );
  }

  // Pass the body through untouched so SSE chunks reach the browser as they land.
  const headers = new Headers(cors);
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

// ── Keys & profiles ───────────────────────────────────────────────────────────

/**
 * Returns the server-held key for a profile, or null when none is configured.
 * The key comes from a direct Worker binding if present, otherwise the vault.
 */
async function serverKeyFor(env: Env, id: string): Promise<string | null> {
  return resolveSecret(env, secretNameFor(id));
}

/** Returns the shared access passcode, or null when none is configured. */
async function accessPasscodeFor(env: Env): Promise<string | null> {
  return resolveSecret(env, "ACCESS_PASSCODE");
}

function effectiveBaseUrl(env: Env, profile: ProviderProfile): string {
  const override = env[baseUrlVarFor(profile.id)];
  const chosen = typeof override === "string" && override.trim() ? override.trim() : profile.baseUrl;
  return chosen.replace(/\/+$/, "");
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function corsHeaders(env: Env, origin: string | null): Headers {
  const configured = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (configured.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && configured.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  // No matching origin → no ACAO header, and the browser blocks the response.

  return headers;
}

function jsonResponse(payload: unknown, status: number, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(status: number, message: string, cors: Headers): Response {
  return jsonResponse({ error: { message } }, status, cors);
}

/**
 * Compares two strings without leaking their contents through timing.
 * Both sides are hashed first so the comparison length is always identical —
 * timingSafeEqual throws on mismatched lengths, and a raw length check would
 * itself leak the secret's length.
 */
async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}
