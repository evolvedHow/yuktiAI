/**
 * Audience input panel — fixed at the bottom of the sidebar.
 * Allows asking a question or requesting the moderator to conclude.
 */
import { useState } from "react";
import { DebateStatus } from "../types";

interface Props {
  status: DebateStatus;
  onAsk: (question: string) => void;
  onConclude: () => void;
}

export function AudienceControls({ status, onAsk, onConclude }: Props) {
  const [question, setQuestion] = useState("");
  const active = status === "active";

  function handleAsk() {
    const q = question.trim();
    if (!q || !active) return;
    onAsk(q);
    setQuestion("");
  }

  return (
    <div className="border-t border-border px-4 py-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        Audience
      </p>

      {/* Question input */}
      <div className="space-y-2">
        <textarea
          rows={2}
          placeholder={active ? "Ask the debaters…" : "Start a debate to ask questions"}
          disabled={!active}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          className="w-full text-xs resize-none rounded-lg border border-border bg-white px-3 py-2 text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-moderator-avatar disabled:opacity-40 disabled:cursor-not-allowed leading-relaxed"
        />
        <button
          onClick={handleAsk}
          disabled={!active || !question.trim()}
          className="w-full text-xs font-medium rounded-lg px-3 py-2 bg-moderator-avatar text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Ask Question
        </button>
      </div>

      {/* Conclude */}
      <button
        onClick={onConclude}
        disabled={status !== "active"}
        className="w-full text-xs font-medium rounded-lg px-3 py-2 border border-border text-muted hover:text-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Signal the Moderator to wrap up and deliver a closing summary"
      >
        Request Conclusion
      </button>
    </div>
  );
}
