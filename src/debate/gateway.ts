/**
 * Gateway helpers — resolving where an LLM call actually goes.
 *
 * Two modes, decided by whether settings.backendUrl is set:
 *
 *   Direct    the browser calls the provider itself with settings.apiKey.
 *             Fine for local dev; the key is in the browser.
 *
 *   Gateway   the browser calls a YuktiAI gateway (the Cloudflare Worker in
 *             worker/, or the Python backend), which injects a pre-defined key
 *             for the selected provider profile. The browser can still send its
 *             own key instead by choosing keySource: "own".
 */

import type { GatewayInfo, LLMSettings } from "../types";

export interface ResolvedEndpoint {
  baseUrl: string;
  /** Empty when the gateway is expected to supply the key. */
  apiKey: string;
  headers: Record<string, string>;
  usingGateway: boolean;
}

export function normalizeGatewayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveEndpoint(settings: LLMSettings): ResolvedEndpoint {
  const gateway = normalizeGatewayUrl(settings.backendUrl);

  if (!gateway) {
    return {
      baseUrl: settings.baseUrl.replace(/\/+$/, ""),
      apiKey: settings.apiKey,
      headers: {},
      usingGateway: false,
    };
  }

  const headers: Record<string, string> = {};
  if (settings.gatewayProviderId) headers["X-Yukti-Provider"] = settings.gatewayProviderId;
  if (settings.gatewayPasscode) headers["X-Yukti-Passcode"] = settings.gatewayPasscode;

  return {
    baseUrl: `${gateway}/v1`,
    apiKey: settings.keySource === "own" ? settings.apiKey : "",
    headers,
    usingGateway: true,
  };
}

/** Fetches the gateway's provider catalogue. Throws on any failure. */
export async function fetchGatewayInfo(
  url: string,
  signal?: AbortSignal,
): Promise<GatewayInfo> {
  const base = normalizeGatewayUrl(url);
  const res = await fetch(`${base}/providers`, {
    signal: signal ?? AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Gateway responded ${res.status}`);

  const data = (await res.json()) as Partial<GatewayInfo>;
  return {
    providers: Array.isArray(data.providers) ? data.providers : [],
    defaultProvider: data.defaultProvider ?? "",
    requiresPasscode: Boolean(data.requiresPasscode),
  };
}

/**
 * Returns a user-facing reason the debate cannot start, or null when the
 * configuration is usable. `info` is optional — when the provider catalogue
 * hasn't loaded we skip the checks that depend on it.
 */
export function describeConfigProblem(
  settings: LLMSettings,
  info: GatewayInfo | null,
): string | null {
  const gateway = normalizeGatewayUrl(settings.backendUrl);

  if (!gateway) {
    // Direct provider mode — the browser must hold a usable key.
    if (!settings.apiKey.trim()) {
      return "No API key is configured. Open Settings → 🔑 Key Vault and paste a provider " +
        "key (e.g. Groq), or point the Key Gateway at your Cloudflare Worker.";
    }
    if (!settings.baseUrl.trim()) {
      return "The provider base URL is missing. In Settings → 🔑 Key Vault set an API base URL " +
        "such as https://api.groq.com/openai/v1.";
    }
    if (!settings.model.trim()) {
      return "No model name is set. In Settings → 🔑 Key Vault enter a model (e.g. llama-3.3-70b-versatile).";
    }
    return null;
  }

  if (settings.keySource === "own" && !settings.apiKey.trim()) {
    return 'Settings is set to "use my own key" but no key is entered. Open Settings → 🔑 Key Vault and add it.';
  }

  if (info) {
    if (info.requiresPasscode && !settings.gatewayPasscode.trim()) {
      return "This gateway requires a passcode — enter it in Settings → 🔑 Key Vault.";
    }
    if (settings.keySource === "server") {
      const provider = info.providers.find((p) => p.id === settings.gatewayProviderId);
      if (provider && !provider.hasServerKey) {
        return `The gateway has no pre-defined key for ${provider.label}. Pick another provider, or switch to your own key in Settings → 🔑 Key Vault.`;
      }
    }
  }

  return null;
}

/** How the app expects keys to be configured right now — for onboarding hints. */
export function configModeLabel(settings: LLMSettings): string {
  return normalizeGatewayUrl(settings.backendUrl)
    ? "gateway"
    : settings.apiKey.trim()
      ? "direct"
      : "none";
}
