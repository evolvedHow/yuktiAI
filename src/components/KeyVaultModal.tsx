/**
 * Key Vault — a password-gated surface for the LLM credentials.
 *
 * The Settings modal mixes keys with pacing, accuracy and reveal toggles. This
 * vault is the one dedicated place to see and change what is actually paying
 * for the debates: the gateway URL, the provider, the passcode, and the
 * keys/model in both gateway and direct mode. It sits behind the password from
 * public/config/vault.yaml so a casual visitor can't redirect your credits.
 *
 * Everything entered here is saved to this browser's localStorage via onSave —
 * nothing is sent anywhere except, at debate time, to the configured provider
 * or gateway.
 */
import { useEffect, useState } from "react";
import { LLMSettings } from "../types";
import {
  lockVault, markVaultUnlocked, vaultCheck, vaultRequiresPassword, vaultUnlockedInSession,
} from "../vault";

interface Props {
  settings: LLMSettings;
  onSave: (patch: Partial<LLMSettings>) => void;
  onClose: () => void;
}

export function KeyVaultModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<LLMSettings>({ ...settings });
  const [locked, setLocked] = useState(true);
  const [checkingLock, setCheckingLock] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showOwn, setShowOwn] = useState(false);
  const [showDirect, setShowDirect] = useState(false);

  useEffect(() => {
    let alive = true;
    vaultRequiresPassword()
      .then((requires) => {
        if (!alive) return;
        // No password configured → vault is open. Otherwise respect session unlock.
        const unlocked = !requires || vaultUnlockedInSession();
        setLocked(!unlocked);
        setCheckingLock(false);
      });
    return () => { alive = false; };
  }, []);

  // Esc closes, matching the other modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function attemptUnlock(e: React.FormEvent) {
    e.preventDefault();
    const ok = await vaultCheck(password);
    if (ok) {
      markVaultUnlocked();
      setLocked(false);
      setAuthError(null);
      setPassword("");
    } else {
      setAuthError("Incorrect password — check public/config/vault.yaml.");
    }
  }

  function handleSave() {
    onSave(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Key Vault"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔑</span>
            <h2 className="text-base font-semibold text-ink">Key Vault</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {checkingLock ? (
          <div className="px-6 py-10 text-center text-sm text-muted">Checking vault access…</div>
        ) : locked ? (
          /* ── Locked ─────────────────────────────────────────────────────── */
          <form onSubmit={attemptUnlock} className="px-6 py-8 space-y-4">
            <div className="text-center">
              <p className="text-sm text-ink font-medium">This vault is password protected.</p>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">
                The API keys and gateway credentials live here. Enter the vault password
                (set in <code className="text-muted/70">public/config/vault.yaml</code>) to view
                or change them.
              </p>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-ink mb-1">Vault password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="off"
                autoFocus
                className="w-full text-sm rounded-lg border border-border px-3 py-2 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-moderator-avatar placeholder:text-muted/50"
              />
            </label>
            {authError && <p className="text-xs text-red-600">{authError}</p>}
            <button
              type="submit"
              disabled={!password.trim()}
              className="w-full text-sm font-medium rounded-lg px-4 py-2 bg-moderator-avatar text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Unlock Vault
            </button>
            <p className="text-[10px] text-muted/70 bg-gray-50 border border-border rounded-lg px-3 py-2 leading-relaxed">
              Client-side note: this gate is obfuscation against casual fiddling, not a hardened
              secret — the password ships with the static site. For real safety the server-backed
              keys live on the Cloudflare Worker (worker/), never in the browser.
            </p>
          </form>
        ) : (
          /* ── Unlocked ───────────────────────────────────────────────────── */
          <div className="px-6 py-5 space-y-5">
            {/* Gateway mode */}
            <section className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Gateway mode <span className="normal-case font-normal">(keys held server-side)</span>
              </p>
              <Field label="Gateway URL">
                <input
                  type="url"
                  value={draft.backendUrl}
                  onChange={(e) => set("backendUrl", e.target.value)}
                  placeholder="https://yukti-llm-gateway.you.workers.dev"
                  className={inputCls}
                />
                <p className="text-[11px] text-muted mt-1">Leave blank for direct mode.</p>
              </Field>
              {draft.backendUrl.trim() && (
                <>
                  <Field label="Provider profile">
                    <input
                      type="text"
                      value={draft.gatewayProviderId}
                      onChange={(e) => set("gatewayProviderId", e.target.value)}
                      placeholder="groq, openai, anthropic, …"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Provider model">
                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) => set("model", e.target.value)}
                      placeholder="llama-3.3-70b-versatile"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Gateway passcode">
                    <input
                      type="password"
                      value={draft.gatewayPasscode}
                      onChange={(e) => set("gatewayPasscode", e.target.value)}
                      placeholder="Required by this gateway"
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="My own key (BYOK, optional)">
                    <PasswordField
                      value={draft.apiKey}
                      onChange={(v) => set("apiKey", v)}
                      show={showOwn}
                      onToggle={() => setShowOwn((v) => !v)}
                      placeholder="sk-… (only if the gateway should spend your key)"
                    />
                  </Field>
                </>
              )}
            </section>

            {/* Direct mode */}
            <section className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Direct mode <span className="normal-case font-normal">(browser holds the key)</span>
              </p>
              <Field label="Provider base URL">
                <input
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) => set("baseUrl", e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                  className={inputCls}
                />
              </Field>
              <Field label="Direct API key">
                <PasswordField
                  value={draft.apiKey}
                  onChange={(v) => set("apiKey", v)}
                  show={showDirect}
                  onToggle={() => setShowDirect((v) => !v)}
                  placeholder="sk-…"
                />
              </Field>
              <Field label="Model">
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="llama-3.3-70b-versatile"
                  className={inputCls}
                />
              </Field>
            </section>

            {savedFlash && (
              <p className="text-xs text-green-700 font-medium">Keys saved to this browser.</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { lockVault(); setLocked(true); }}
                className="text-xs text-muted hover:text-ink transition-colors"
              >
                Lock vault
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="text-sm px-4 py-2 rounded-lg bg-moderator-avatar text-white hover:bg-blue-600 transition-colors font-medium"
                >
                  Save keys
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full text-sm rounded-lg border border-border px-3 py-2 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-moderator-avatar placeholder:text-muted/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink mb-1">{label}</label>
      {children}
    </div>
  );
}

function PasswordField({
  value, onChange, show, onToggle, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute inset-y-0 right-0 pr-3 text-sm text-muted hover:text-ink"
        title={show ? "Hide key" : "Reveal key"}
        tabIndex={-1}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}