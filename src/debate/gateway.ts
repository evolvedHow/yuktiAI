/**
 * Gateway helpers — where LLM calls actually go.
 *
 * Every LLM call is proxied through a gateway (the worker-env Cloudflare
 * Worker), which holds each provider's key server-side and injects it on our
 * behalf. The browser never sees a key. The user only picks a provider from
 * the catalogue advertised by GET /providers, pays for access with the gateway
 * passcode when one is set, and can override the model.
 */

import type { GatewayInfo, LLMSettings } from "../types";

export interface ResolvedEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
  usingGateway: boolean;
}

export function normalizeGatewayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveEndpoint(settings: LLMSettings): ResolvedEndpoint {
  const gateway = normalizeGatewayUrl(settings.backendUrl);

  if (!gateway) {
    return { baseUrl: "", headers: {}, usingGateway: false };
  }

  const headers: Record<string, string> = {};
  if (settings.gatewayProviderId) headers["X-Yukti-Provider"] = settings.gatewayProviderId;
  if (settings.gatewayPasscode) headers["X-Yukti-Passcode"] = settings.gatewayPasscode;

  return {
    baseUrl: `${gateway}/v1`,
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
    return "No gateway is configured. Open Settings and enter the gateway URL " +
      "(or bake it in at build time with VITE_BACKEND_URL).";
  }
  if (!settings.model.trim()) {
    return "No model name is set. In Settings pick a provider to pre-fill a model, or enter one.";
  }

  if (info) {
    if (info.requiresPasscode && !settings.gatewayPasscode.trim()) {
      return "This gateway requires a passcode — enter it in Settings.";
    }
    const provider = info.providers.find((p) => p.id === settings.gatewayProviderId);
    if (!provider) {
      return "Pick a provider in Settings — the gateway has no key for the currently selected one.";
    }
    if (!provider.hasServerKey) {
      return `The gateway has no pre-defined key for ${provider.label}. Open Settings and pick a different provider.`;
    }
    if (provider.models.length > 0 && !provider.models.includes(settings.model)) {
      const hint = provider.defaultModel || provider.models[0];
      return `"${settings.model}" is not a model ${provider.label} knows. In Settings use ${hint}, or one of its listed models.`;
    }
  }

  return null;
}