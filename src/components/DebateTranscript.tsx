/**
 * Main debate transcript panel — auto-scrolls as new messages arrive.
 */
import { useEffect, useRef } from "react";
import { DebateStatus, GateState, Message, Topic } from "../types";
import { MessageCard } from "./MessageCard";
import { TurnGate } from "./TurnGate";
import { downloadMarkdown } from "../utils/exportMarkdown";

interface Props {
  topic: Topic | null;
  messages: Message[];
  status: DebateStatus;
  gateState: GateState;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function DebateTranscript({ topic, messages, status, gateState, onAdvance, onPause, onResume }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!topic) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 select-none">
        <div className="text-5xl mb-4 opacity-20">⚖️</div>
        <h2 className="text-xl font-medium text-ink/60 mb-2">YuktiAI Debate Arena</h2>
        <p className="text-sm text-muted max-w-xs">
          Select a topic from the sidebar to begin. The debate will advance automatically.
        </p>
      </div>
    );
  }

  // ── Status badge ───────────────────────────────────────────────────────────
  const badge: Record<DebateStatus, { cls: string; label: string }> = {
    idle: { cls: "bg-gray-100 text-gray-500", label: "Ready" },
    active: { cls: "bg-green-100 text-green-700", label: "Live" },
    concluding: { cls: "bg-yellow-100 text-yellow-700", label: "Concluding…" },
    done: { cls: "bg-gray-100 text-gray-500", label: "Ended" },
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-start justify-between gap-4 px-6 py-4 bg-surface border-b border-border">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink leading-snug truncate">
            {topic.title}
          </h1>
          {topic.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
              {topic.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge[status].cls}`}
          >
            {badge[status].label}
          </span>
          {messages.length > 0 && status === "done" && (
            <button
              onClick={() => downloadMarkdown(topic, messages)}
              className="text-xs text-muted hover:text-ink border border-border rounded-lg px-3 py-1 transition-colors hover:bg-white"
              title="Download full debate as Markdown"
            >
              Export .md
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable transcript ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0.5">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}

        {/* Inter-turn gate — countdown bar with pause/advance controls */}
        {gateState.active && (
          <TurnGate
            gate={gateState}
            onAdvance={onAdvance}
            onPause={onPause}
            onResume={onResume}
          />
        )}

        {/* Typing indicator — only while LLM is generating (gate not active) */}
        {status === "active" && !gateState.active && messages.length > 0 && !messages[messages.length - 1].streaming && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
            </span>
            <span>Generating response…</span>
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
