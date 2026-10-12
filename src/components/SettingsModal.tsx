/**
 * Settings modal — configure which gateway provider pays for the debates, pick
 * the model, set the passcode, and tune pacing, accuracy and reveal.
 * All values are saved to localStorage.
 *
 * Keys are always held server-side by the gateway — the provider list comes
 * from its public GET /providers and only keyed providers are selectable.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS, GatewayInfo, LLMSettings,
  TYPEWRITER_PRESETS,
} from "../types";
import { BackendStatus } from "../hooks/useDebate";
import { fetchGatewayInfo, normalizeGatewayUrl } from "../debate/gateway";

interface Props {
  settings: LLMSettings;
  backendStatus: BackendStatus;
  onSave: (patch: Partial<LLMSettings>) => void;
  onClose: () => void;
}

type ProbeStatus = "idle" | "testing" | "ok" | "fail";

export function SettingsModal({ settings, backendStatus, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<LLMSettings>({ ...settings });
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [info, setInfo] = useState<GatewayInfo | null>(null);

  function set<K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function setTypewriter(patch: Partial<LLMSettings["typewriter"]>) {
    setDraft((prev) => ({ ...prev, typewriter: { ...prev.typewriter, ...patch } }));
  }

  function setFactCheck(patch: Partial<LLMSettings["factCheck"]>) {
    setDraft((prev) => ({ ...prev, factCheck: { ...prev.factCheck, ...patch } }));
  }

  const usingGateway = Boolean(normalizeGatewayUrl(draft.backendUrl));

  // ── Probe the gateway as the URL is edited (debounced) ──────────────────
  const gatewayUrl = normalizeGatewayUrl(draft.backendUrl);
  const probeSeq = useRef(0);

  useEffect(() => {
    if (!gatewayUrl) {
      setInfo(null);
      setProbeStatus("idle");
      return;
    }

    const seq = ++probeSeq.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setProbeStatus("testing");
      fetchGatewayInfo(gatewayUrl, controller.signal)
        .then((next) => {
          if (seq !== probeSeq.current) return;
          setInfo(next);
          setProbeStatus("ok");
        })
        .catch(() => {
          if (seq !== probeSeq.current || controller.signal.aborted) return;
          setInfo(null);
          setProbeStatus("fail");
        });
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [gatewayUrl]);

  // Pre-fill the model when the user switches gateway provider.
  function selectGatewayProvider(id: string) {
    const provider = info?.providers.find((p) => p.id === id);
    setDraft((prev) => ({
      ...prev,
      gatewayProviderId: id,
      model: provider?.defaultModel || prev.model,
    }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_SETTINGS });
    setProbeStatus("idle");
  }

  // Only providers the gateway can actually pay for are selectable.
  const pickable = info?.providers.filter((p) => p.hasServerKey) ?? [];
  const selectedProvider = info?.providers.find((p) => p.id === draft.gatewayProviderId);

  const statusPill = (() => {
    if (!usingGateway) return null;
    if (probeStatus === "testing") return <Pill color="gray">Checking…</Pill>;
    if (probeStatus === "ok") {
      const count = pickable.length;
      return <Pill color="green">{count} key{count === 1 ? "" : "s"} ready</Pill>;
    }
    if (probeStatus === "fail") return <Pill color="red">Unreachable</Pill>;
    if (backendStatus === "online") return <Pill color="green">Online</Pill>;
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
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
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

          {/* ── Gateway ──────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Provider Gateway
              </p>
              {statusPill}
            </div>

            <input
              type="url"
              value={draft.backendUrl}
              onChange={(e) => set("backendUrl", e.target.value)}
              placeholder="https://worker-env-vault.vish-ganapathy.workers.dev"
              className={inputCls}
            />

            <p className="text-[11px] text-muted leading-relaxed">
              Every LLM call is proxied through this gateway, which holds the API keys
              server-side. Nothing secret is stored in your browser. Normally this is
              baked in at build time — you only need to touch it if the gateway moves.
            </p>

            <Field label="Gateway passcode">
              <input
                type="password"
                value={draft.gatewayPasscode}
                onChange={(e) => set("gatewayPasscode", e.target.value)}
                placeholder="Required once the gateway sets ACCESS_PASSCODE"
                autoComplete="off"
                className={inputCls}
              />
            </Field>
          </div>

          {/* ── Provider + model ─────────────────────────────────────────── */}
          {usingGateway && (
            <div className="space-y-4">
              {info && info.providers.length > 0 ? (
                <Field label="Provider">
                  <select
                    value={draft.gatewayProviderId}
                    onChange={(e) => selectGatewayProvider(e.target.value)}
                    className={inputCls}
                  >
                    {info.providers.map((p) => {
                      const disabled = !p.hasServerKey;
                      return (
                        <option key={p.id} value={p.id} disabled={disabled}>
                          {p.label}
                          {disabled ? "  ·  no key on gateway" : "  ·  key on gateway"}
                        </option>
                      );
                    })}
                  </select>
                  {pickable.length === 0 ? (
                    <p className="text-[11px] text-red-600 mt-1">
                      This gateway has no provider keys configured. Add KEY_&lt;provider&gt;
                      secrets server-side, or point at a gateway that does.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted mt-1">
                      {selectedProvider?.hasServerKey
                        ? "The gateway holds a pre-defined key for this provider — no key needed on your side."
                        : "Pick a provider the gateway has a key for."}
                    </p>
                  )}
                </Field>
              ) : (
                <p className="text-[11px] text-muted">
                  {probeStatus === "fail"
                    ? "Could not read the provider list from this gateway. Check the URL and try again."
                    : "Reading the provider list…"}
                </p>
              )}

              <Field label="Model">
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder={selectedProvider?.defaultModel || "groq/compound-mini"}
                  list={selectedProvider?.models?.length ? "gateway-models" : undefined}
                  className={inputCls}
                />
                {selectedProvider?.models && selectedProvider.models.length > 0 && (
                  <datalist id="gateway-models">
                    {selectedProvider.models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                )}
              </Field>
            </div>
          )}

          {/* ── Pacing ───────────────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Pacing
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
              <Field label="Pause between turns">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={Math.round(draft.interTurnDelayMs / 1000)}
                    onChange={(e) => set("interTurnDelayMs", Math.max(0, Number(e.target.value)) * 1000)}
                    disabled={!draft.autoAdvance}
                    className={`${inputCls} disabled:opacity-40`}
                  />
                  <span className="text-[11px] text-muted shrink-0">sec</span>
                </div>
              </Field>
            </div>

            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoAdvance}
                onChange={(e) => set("autoAdvance", e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] text-muted leading-relaxed">
                <span className="text-ink font-medium">Advance automatically.</span>{" "}
                {draft.autoAdvance
                  ? "The next agent is called after the pause above. You can still skip ahead or hold the countdown from the transcript."
                  : "The debate waits at every turn until you click Continue — no timer runs between LLM calls."}
              </span>
            </label>
          </div>

          {/* ── Accuracy ─────────────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Accuracy
            </p>

            <div className="space-y-3">
              <Toggle
                checked={draft.factCheck.evidencePolicy}
                onChange={(v) => setFactCheck({ evidencePolicy: v })}
                title="Sourcing rules"
              >
                Tells every speaker not to invent URLs, statistics, quotations or study
                names, and to cite by publication and year when they can't supply a real
                link. This is prevention and it is free — no extra calls.
              </Toggle>

              <Toggle
                checked={draft.factCheck.verifyLinks}
                onChange={(v) => setFactCheck({ verifyLinks: v })}
                title="Verify links"
              >
                Every URL a speaker cites is fetched through the gateway. A link that 404s
                is struck through in the transcript and the turn is sent back for a redo.
                This is measured, not guessed.
              </Toggle>

              <Toggle
                checked={draft.factCheck.reviewClaims}
                onChange={(v) => setFactCheck({ reviewClaims: v })}
                title="Review claims"
              >
                A reviewer model reads each turn and flags precise figures, named studies
                and quotations that look invented. This is judgement, not verification —
                it catches a lot, misses some, and occasionally objects to something true.
                <span className="block mt-0.5 text-amber-700">
                  Costs one extra LLM call per turn, roughly doubling usage.
                </span>
              </Toggle>

              <Field label="Redos allowed per turn">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={draft.factCheck.maxRedos}
                    onChange={(e) =>
                      setFactCheck({ maxRedos: Math.min(3, Math.max(0, Number(e.target.value))) })
                    }
                    disabled={!draft.factCheck.verifyLinks && !draft.factCheck.reviewClaims}
                    className={`${inputCls} w-20 disabled:opacity-40`}
                  />
                  <span className="text-[11px] text-muted leading-relaxed">
                    {draft.factCheck.maxRedos === 0
                      ? "Problems are reported but never sent back — the turn stands as delivered."
                      : "A rejected turn is re-delivered with the specific corrections. If it still fails after the last attempt, it stands with the findings shown."}
                  </span>
                </div>
              </Field>
            </div>
          </div>

          {/* ── New topic review ─────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              New Topics
            </p>

            <Toggle
              checked={draft.reviewNewTopics}
              onChange={(v) => set("reviewNewTopics", v)}
              title="Review new topics with AI"
            >
              When you save a new topic, its prompt is first passed through the topic-review
              agent (public/agents/topic-reviewer.md), which sharpens the title and adds search
              keywords. The result is shown back to you before anything is
              saved — your intent is never silently replaced. Skipped automatically until the
              gateway is configured.
            </Toggle>
          </div>

          {/* ── Response reveal ──────────────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Response Reveal
            </p>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.typewriter.enabled}
                onChange={(e) => setTypewriter({ enabled: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-[11px] text-muted leading-relaxed">
                <span className="text-ink font-medium">Typewriter effect.</span>{" "}
                Reveals each response at a steady pace instead of in bursts, so it can be read as
                it arrives. The next agent waits until the current one has finished appearing.
              </span>
            </label>

            {draft.typewriter.enabled && (
              <div className="mt-3 space-y-3 pl-6">
                <Field label="Reveal by">
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    {(["word", "char"] as const).map((mode, i) => (
                      <button
                        key={mode}
                        onClick={() => setTypewriter({ mode })}
                        className={[
                          "flex-1 py-1.5 px-2 transition-colors leading-none",
                          i > 0 ? "border-l border-border" : "",
                          draft.typewriter.mode === mode
                            ? "bg-moderator-bg text-moderator-text font-semibold"
                            : "bg-white text-ink hover:bg-gray-50",
                        ].join(" ")}
                      >
                        {mode === "word" ? "Word" : "Character"}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field
                  label={`Speed — ${draft.typewriter.unitsPerSecond} ${
                    draft.typewriter.mode === "word" ? "words" : "characters"
                  }/sec`}
                >
                  <input
                    type="range"
                    min={1}
                    max={draft.typewriter.mode === "word" ? 30 : 120}
                    step={1}
                    value={draft.typewriter.unitsPerSecond}
                    onChange={(e) => setTypewriter({ unitsPerSecond: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex gap-2 mt-2">
                    {TYPEWRITER_PRESETS.map((p) => {
                      // Characters run roughly 5× faster than words for the same feel.
                      const value = draft.typewriter.mode === "word"
                        ? p.unitsPerSecond
                        : p.unitsPerSecond * 5;
                      return (
                        <button
                          key={p.label}
                          onClick={() => setTypewriter({ unitsPerSecond: value })}
                          className={[
                            "text-[11px] rounded-lg px-2.5 py-1 border transition-colors",
                            draft.typewriter.unitsPerSecond === value
                              ? "border-moderator-avatar bg-moderator-bg text-moderator-text"
                              : "border-border text-muted hover:bg-gray-50",
                          ].join(" ")}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white flex justify-between items-center px-6 py-4 border-t border-border">
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

function Toggle({
  checked, onChange, title, disabled, children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`flex items-start gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="text-[11px] text-muted leading-relaxed">
        <span className="text-ink font-medium">{title}.</span> {children}
      </span>
    </label>
  );
}

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