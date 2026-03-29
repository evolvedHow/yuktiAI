/**
 * Settings modal — configure LLM provider, model, API key, debate parameters,
 * and optional backend server.
 * All values saved to localStorage.
 */
import { useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, LLMSettings, PROVIDER_PRESETS } from "../types";
import { BackendStatus } from "../hooks/useDebate";

interface Props {
  settings: LLMSettings;
  backendStatus: BackendStatus;
  onSave: (patch: Partial<LLMSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, backendStatus, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<LLMSettings>({ ...settings });
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  function set<K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (key === "backendUrl") setTestStatus("idle");
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_SETTINGS });
    setTestStatus("idle");
  }

  function applyPreset(baseUrl: string, placeholder: string) {
    setDraft((prev) => ({ ...prev, baseUrl, model: placeholder }));
  }

  async function testBackend() {
    const url = draft.backendUrl.trim();
    if (!url) return;
    setTestStatus("testing");
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  }

  const usingBackend = Boolean(draft.backendUrl.trim());

  // Pill shown next to the Backend URL field reflecting live/saved status
  const statusPill = (() => {
    if (testStatus === "testing") return <Pill color="gray">Testing…</Pill>;
    if (testStatus === "ok")      return <Pill color="green">Connected</Pill>;
    if (testStatus === "fail")    return <Pill color="red">Unreachable</Pill>;
    if (!usingBackend) return null;
    if (backendStatus === "online")  return <Pill color="green">Online</Pill>;
    if (backendStatus === "offline") return <Pill color="red">Offline</Pill>;
    return <Pill color="gray">Unknown</Pill>;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="LLM Settings"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-ink">Settings</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Backend Server ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Backend Server
              </p>
              {statusPill}
            </div>

            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <input
                  type="url"
                  value={draft.backendUrl}
                  onChange={(e) => set("backendUrl", e.target.value)}
                  placeholder="http://localhost:8080  (leave blank for direct mode)"
                  className={inputCls}
                />
              </div>
              <button
                onClick={testBackend}
                disabled={!draft.backendUrl.trim() || testStatus === "testing"}
                className="shrink-0 text-xs px-3 py-2 rounded-lg border border-border bg-white text-muted hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                Test
              </button>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              {usingBackend
                ? "LLM calls will be proxied through this server. The API key below is ignored — the backend uses its own key."
                : "Leave blank to call LLM providers directly from the browser (GitHub Pages compatible). Set this to a deployed YuktiAI backend to keep your API key server-side."}
            </p>
          </div>

          {/* ── Direct provider settings (dimmed when backend active) ────── */}
          <div className={usingBackend ? "opacity-40 pointer-events-none select-none" : ""}>
            {/* Provider presets */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Provider Preset
              </label>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.baseUrl}
                    onClick={() => applyPreset(p.baseUrl, p.placeholder)}
                    className={[
                      "text-xs rounded-lg px-3 py-1.5 border transition-colors",
                      draft.baseUrl === p.baseUrl
                        ? "border-moderator-avatar bg-moderator-bg text-moderator-text"
                        : "border-border text-muted hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Base URL */}
            <div className="mt-4">
              <Field label="API Base URL">
                <input
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) => set("baseUrl", e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                  className={inputCls}
                />
                <p className="text-[11px] text-muted mt-1">OpenAI-compatible endpoint (no trailing slash)</p>
              </Field>
            </div>

            {/* API Key */}
            <div className="mt-4">
              <Field label="API Key">
                <input
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => set("apiKey", e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  className={inputCls}
                />
                <p className="text-[11px] text-muted mt-1">
                  Stored in your browser's localStorage only — never sent to any server except the LLM provider you configure.
                </p>
              </Field>
            </div>

            {/* Model */}
            <div className="mt-4">
              <Field label="Model">
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="llama-3.3-70b-versatile"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          {/* Model override when backend is active */}
          {usingBackend && (
            <Field label="Model">
              <input
                type="text"
                value={draft.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="llama-3.3-70b-versatile"
                className={inputCls}
              />
              <p className="text-[11px] text-muted mt-1">
                Sent to the backend — must be a model the backend's configured provider supports.
              </p>
            </Field>
          )}

          {/* Debate parameters */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Debate Parameters
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Max turns">
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={draft.maxTurns}
                  onChange={(e) => set("maxTurns", Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Max tokens / turn">
                <input
                  type="number"
                  min={100}
                  max={1500}
                  step={50}
                  value={draft.maxTokensPerTurn}
                  onChange={(e) => set("maxTokensPerTurn", Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Turn delay (ms)">
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={draft.interTurnDelayMs}
                  onChange={(e) => set("interTurnDelayMs", Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-border">
          <button
            onClick={handleReset}
            className="text-xs text-muted hover:text-ink transition-colors"
          >
            Reset to defaults
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
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full text-sm rounded-lg border border-border px-3 py-2 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-moderator-avatar placeholder:text-muted/50";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink mb-1">{label}</label>
      {children}
    </div>
  );
}

function Pill({ color, children }: { color: "green" | "red" | "gray"; children: ReactNode }) {
  const cls = {
    green: "bg-green-100 text-green-700 border-green-200",
    red:   "bg-red-100 text-red-700 border-red-200",
    gray:  "bg-gray-100 text-gray-500 border-gray-200",
  }[color];
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}
