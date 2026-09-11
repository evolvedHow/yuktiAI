/** Custom Topic Modal — lets the user debate a topic that isn't in the topic files. */
import { useEffect, useState } from "react";
import { Topic } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTopicSelect: (topic: Topic) => void;
}

export function CustomTopicModal({ isOpen, onClose, onTopicSelect }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Esc closes, matching the Settings modal.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      setTitle("");
      setDescription("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const customTopic: Topic = {
      id: `custom-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      source: "custom",
    };

    onTopicSelect(customTopic);
    onClose();
    setTitle("");
    setDescription("");
  }

  function handleCancel() {
    onClose();
    setTitle("");
    setDescription("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Enter a custom debate topic"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl ring-1 ring-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Enter Custom Topic</h2>
          <button
            onClick={handleCancel}
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
          <div className="space-y-2">
            <label htmlFor="topic-title" className="block text-sm font-medium text-ink">
              Topic Title <span className="text-red-500">*</span>
            </label>
            <input
              id="topic-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Is artificial intelligence a threat to humanity?"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-moderator-avatar"
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
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-moderator-avatar resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs font-medium rounded-lg px-4 py-2 border border-border text-muted hover:text-ink hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="text-xs font-medium rounded-lg px-4 py-2 bg-moderator-avatar text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Start Debate
            </button>
          </div>
        </form>

        {/* Footer note */}
        <div className="border-t border-border px-6 py-3 bg-muted/10 rounded-b-xl">
          <p className="text-[10px] text-muted/70">
            The topic is saved to this browser so you can re-run it from the sidebar.
            A specific description produces a sharper debate.
          </p>
        </div>
      </div>
    </div>
  );
}
