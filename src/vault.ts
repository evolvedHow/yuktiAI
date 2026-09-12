/**
 * Key Vault access control.
 *
 * The vault holds the LLM credentials — the gateway URL, provider, passcode and the
 * browser-held key. It is gated behind a password so a casual visitor to the deployed
 * site can't open Settings and re-point the debates at their own expense any more than
 * they could read the keys. The password lives in public/config/vault.yaml (build-time
 * bundled). A blank password means "not protected".
 *
 * Explicit caveat: this is client-side only. The file ships with the site, so the check
 * is obfuscation against casual fiddling, not a hardened secret. Real credential safety
 * comes from holding keys on the Cloudflare Worker (worker/) instead of in the browser.
 */

import { load as yamlLoad } from "js-yaml";

const UNLOCK_SESSION_KEY = "yuktiai_keyvault_unlocked";

export interface VaultConfig {
  /** Password required to unlock. Empty string disables the lock. */
  password: string;
}

let cachedConfig: VaultConfig | null = null;
let loadingConfig: Promise<VaultConfig> | null = null;

/** Loads the vault config from public/config/vault.yaml (once, memoised). */
export async function loadVaultConfig(): Promise<VaultConfig> {
  if (cachedConfig) return cachedConfig;
  if (!loadingConfig) {
    loadingConfig = (async () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      try {
        const res = await fetch(`${base}/config/vault.yaml`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = yamlLoad(await res.text()) as { password?: unknown };
        cachedConfig = { password: typeof parsed?.password === "string" ? parsed.password : "" };
      } catch {
        // No config file → the vault is not password-protected.
        cachedConfig = { password: "" };
      }
      return cachedConfig;
    })();
  }
  return loadingConfig;
}

/** True when an administrator password is configured. */
export async function vaultRequiresPassword(): Promise<boolean> {
  const cfg = await loadVaultConfig();
  return Boolean(cfg.password);
}

/** Checks a candidate password. Protects against obvious length leak. */
export async function vaultCheck(password: string): Promise<boolean> {
  const cfg = await loadVaultConfig();
  if (!cfg.password) return true;
  const a = password.trim();
  const b = cfg.password.trim();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Session-scoped unlock — survives settings changes but not browser restarts. */
export function vaultUnlockedInSession(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markVaultUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_SESSION_KEY, "1");
  } catch {
    /* storage unavailable — treat as unlocked for this component lifetime */
  }
}

export function lockVault(): void {
  try {
    sessionStorage.removeItem(UNLOCK_SESSION_KEY);
  } catch {
    /* ignore */
  }
}