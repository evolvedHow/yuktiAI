/**
 * Topic Editor Modal — add or edit a managed topic.
 *
 * Handles the full life of a user topic:
 *   - Title, description, search keywords, and a tone chosen with radio buttons
 *     (Serious / Jovial / Informal) instead of something baked into the topic.
 *   - Optional AI "review & refine": the raw prompt is sent to the topic-review
 *     agent (public/agents/topic-reviewer.md), which returns a tightened title,
 *     neutral framing, keywords and a suggested tone. The result is shown back
 *     for approval; the model edits the user's words, never silently replaces
 *     their intent. Skipped automatically when no API key is configured.
 *   - Edit mode pre-fills an existing managed topic in place.
 */
import { useEffect, useState } from "react";
import { resolveTone, Topic, TopicTone, TONE_DEFS } from "../types";
import { TopicReviewResult } from "../debate/topicReview";

interface Props {
  isOpen: boolean;
  /** Set to an existing managed topic to edit it; null/undefined = new topic. */
  topic?: Topic | null;
  /** Whether the LLM is configured well enough to run the review agent. */
  configReady: boolean;
  /** settings.reviewNewTopics — auto-review new topics before saving. */
  reviewEnabled: boolean;
  onClose: () => void;
  onSave: (topic: Topic) => void;
  onReview: (title: string, description: string) => Promise<TopicReviewResult>;
}

type ReviewState = "idle" | "working" | "done" | "error";

const emptyTone: TopicTone = "serious";

export function CustomTopicModal({
  isOpen, topic, configReady, reviewEnabled, onClose, onSave, onReview,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [tone, setTone] = useState<TopicTone>(emptyTone);
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);

  const editing = Boolean(topic);

  // Initialise / reset whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(topic?.title ?? "");
    setDescription(topic?.description ?? "");
    setKeywordsText((topic?.keywords ?? []).join(", "));
    setTone(resolveTone(topic?.tone));
    setReviewState("idle");
    setReviewError(null);
  }, [isOpen, topic]);

  // Esc closes, matching the other modals.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const keywords = keywordsText
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  async function runReview(): Promise<void> {
    const rawTitle = title.trim() || (topic?.title ?? "");
    if (!rawTitle) {
      setReviewError("Add a topic title first, then the agent can refine it.");
      setReviewState("error");
      return;
    }
    setReviewState("working");
    setReviewError(null);
    try {
      const result = await onReview(rawTitle, description.trim());
      setTitle(result.title);
      setDescription(result.description);
      setKeywordsText(result.keywords.join(", "));
      setTone(result.tone);
      setReviewState("done");
    } catch (err) {
      setReviewError((err as Error).message);
      setReviewState("error");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    // New topics flow through the review agent first (when enabled and the LLM
    // is configured). The refined result is shown back; one more Save commits.
    if (!editing && reviewEnabled && configReady && reviewState !== "done") {
      void runReview();
      return;
    }

    const saved: Topic = {
      id: topic?.id ?? `custom-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      keywords: keywords.length > 0 ? keywords : undefined,
      tone: resolveTone(tone),
      source: "custom",
      uses: topic?.uses ?? 0,
      likes: topic?.likes ?? 0,
      dislikes: topic?.dislikes ?? 0,
    };
    onSave(saved);
    onClose();
  }

  const reviewHint = !configReady
    ? "AI review is unavailable until an API key is configured (Settings → 🔑 Key Vault) — saving as-is."
    : reviewEnabled
      ? "New topics are sent through the topic-review agent, which sharpens the title, adds search keywords, and picks a tone. You approve its edits before saving."
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Topic editor"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl ring-1 ring-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            {editing ? "Edit Topic" : "Add Topic"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink rounded-lg p-1.5 hover:bg-white transition-colors"
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Review status banner */}
          {reviewState === "working" && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Topic-review agent is refining your prompt…
            </div>
          )}
          {reviewState === "done" && (
            <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✨ The agent refined this topic. Prefer the original? Re-type it — saving keeps whatever
              is in the fields now.
            </div>
          )}
          {reviewError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Review failed: {reviewError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="topic-title" className="block text-sm font-medium text-ink">
              Topic Title <span className="text-red-500">*</span>
            </label>
            <input
              id="topic-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Should AI-generated political ads require disclosure labels?"
              className={inputCls}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="topic-description" className="block text-sm font-medium text-ink">
              Description (Optional)
            </label>
            <textarea
              id="topic-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Framing, context, or the specific angle the debaters should argue over…"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="topic-keywords" className="block text-sm font-medium text-ink">
              Search Keywords (Optional)
            </label>
            <input
              id="topic-keywords"
              type="text"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="ai, elections, regulation (comma separated)"
              className={inputCls}
            />
            <p className="text-[11px] text-muted">Used by the sidebar search to find this topic again.</p>
          </div>

          {/* Tone radio */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">
              Tone <span className="text-muted font-normal">— how the debaters fight &amp; how strictly they're fact-checked</span>
            </label>
            <div role="radiogroup" aria-label="Tone" className="space-y-2">
              {TONE_DEFS.map((def) => (
                <label
                  key={def.id}
                  className={[
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                    tone === def.id
                      ? "border-moderator-avatar bg-moderator-bg"
                      : "border-border bg-white hover:bg-gray-50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="tone"
                    value={def.id}
                    checked={tone === def.id}
                    onChange={() => setTone(def.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{def.label}</span>
                    <span className="block text-[11px] text-muted leading-relaxed">{def.tagline}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {reviewHint && (
            <p className="text-[11px] text-muted/80 bg-muted/10 border border-border rounded-lg px-3 py-2 leading-relaxed">
              {reviewHint}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {!editing && configReady && (
              <button
                type="button"
                onClick={() => void runReview()}
                disabled={reviewState === "working"}
                className="text-xs font-medium rounded-lg px-3 py-2 border border-dashed border-amber-400 text-amber-800 hover:bg-amber-50 transition-colors disabled:opacity-50"
                title="Send this prompt to the topic-review agent"
              >
                ✨ Review &amp; refine
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium rounded-lg px-4 py-2 border border-border text-muted hover:text-ink hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || reviewState === "working"}
                className="text-xs font-medium rounded-lg px-4 py-2 bg-moderator-avatar text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {editing ? "Save Changes" : reviewEnabled && configReady && reviewState !== "done" ? "Review & Save" : "Save Topic"}
              </button>
            </div>
          </div>
        </form>

        {/* Footer note */}
        <div className="border-t border-border px-6 py-3 bg-muted/10 rounded-b-xl">
          <p className="text-[10px] text-muted/70">
            Saved topics appear under <strong>My Topics</strong> in the sidebar with usage and
            like/dislike counters. {editing ? "A topic is created for you if this one didn't exist." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-moderator-avatar";