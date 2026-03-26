/**
 * Settings modal — configure LLM provider, model, API key, and debate parameters.
 * All values saved to localStorage.
 */
import { useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, LLMSettings, PROVIDER_PRESETS } from "../types";

interface Props {
  settings: LLMSettings;
  onSave: (patch: Partial<LLMSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<LLMSettings>({ ...settings });

  function set<K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_SETTINGS });
  }

  function applyPreset(baseUrl: string, placeholder: string) {
    setDraft((prev) => ({ ...prev, baseUrl, model: placeholder }));
  }

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

          {/* API Key */}
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

          {/* Model */}
          <Field label="Model">
            <input
              type="text"
              value={draft.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="llama-3.3-70b-versatile"
              className={inputCls}
            />
          </Field>

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
