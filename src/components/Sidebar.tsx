/**
 * Left sidebar:
 *   - YuktiAI branding
 *   - Topic list (scrollable)
 *   - Audience controls (pinned to bottom)
 *   - On mobile: becomes a slide-in drawer triggered by a hamburger button
 */
import { useState } from "react";
import { DebateStatus, Topic } from "../types";
import { AudienceControls } from "./AudienceControls";

interface Props {
  topics: Topic[];
  activeTopic: Topic | null;
  status: DebateStatus;
  onSelectTopic: (topic: Topic) => void;
  onAsk: (question: string) => void;
  onConclude: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  topics,
  activeTopic,
  status,
  onSelectTopic,
  onAsk,
  onConclude,
  onOpenSettings,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inner = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="shrink-0 px-5 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-ink tracking-tight">YuktiAI</h1>
          <p className="text-[10px] text-muted mt-0.5">Debate Arena</p>
        </div>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="text-muted hover:text-ink rounded-lg p-1.5 hover:bg-white transition-colors"
          aria-label="Open settings"
        >
          <SettingsIcon />
        </button>
      </div>

      {/* Topic list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-2">
          Topics
        </p>
        <ul className="space-y-0.5">
          {topics.map((topic) => {
            const isActive = activeTopic?.id === topic.id;
            return (
              <li key={topic.id}>
                <button
                  onClick={() => {
                    onSelectTopic(topic);
                    setDrawerOpen(false);
                  }}
                  className={[
                    "w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors group",
                    isActive
                      ? "bg-moderator-bg text-moderator-text font-medium"
                      : "text-ink hover:bg-white",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="block leading-snug">{topic.title}</span>
                  {topic.description && (
                    <span
                      className={[
                        "block text-[11px] mt-0.5 line-clamp-2 leading-relaxed",
                        isActive ? "text-moderator-text/70" : "text-muted group-hover:text-ink/60",
                      ].join(" ")}
                    >
                      {topic.description}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Audience controls */}
      <div className="shrink-0">
        <AudienceControls status={status} onAsk={onAsk} onConclude={onConclude} />
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (always visible ≥ md) ─────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[280px] shrink-0 h-screen border-r border-border bg-surface overflow-hidden sticky top-0">
        {inner}
      </aside>

      {/* ── Mobile: hamburger button ──────────────────────────────────────── */}
      <button
        className="md:hidden fixed top-3 left-3 z-40 bg-white border border-border rounded-lg p-2 shadow-sm"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-surface border-r border-border shadow-xl">
            <button
              className="absolute top-3 right-3 text-muted hover:text-ink p-1"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
            {inner}
          </aside>
        </>
      )}
    </>
  );
}

// ── Inline SVG icons (no icon library dependency) ─────────────────────────────

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
