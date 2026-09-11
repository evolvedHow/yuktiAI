/**
 * Left sidebar:
 *   - YuktiAI branding
 *   - Topic-file dropdown (select which .yml file to load)
 *   - Topic list (scrollable)
 *   - Custom topic entry option
 *   - Audience controls (pinned to bottom)
 *   - On mobile: becomes a slide-in drawer triggered by a hamburger button
 */
import { useState } from "react";
import { DebateStatus, DebateStyle, resolveRegister, Topic, TopicFileEntry } from "../types";
import { AudienceControls } from "./AudienceControls";
// CustomTopicModal is handled by parent App

interface Props {
  topicFiles: TopicFileEntry[];
  selectedTopicFile: TopicFileEntry | null;
  onSelectTopicFile: (file: string) => void;
  topics: Topic[];
  /** Manually entered topics, persisted in this browser. */
  customTopics: Topic[];
  onRemoveCustomTopic: (id: string) => void;
  activeTopic: Topic | null;
  status: DebateStatus;
  onSelectTopic: (topic: Topic) => void;
  onAsk: (question: string) => void;
  onConclude: () => void;
  onOpenSettings: () => void;
  onOpenCustomTopic: () => void;
  debateStyles: DebateStyle[];
  activeStyle: DebateStyle;
  onSelectStyle: (style: DebateStyle) => void;
}

export function Sidebar({
  topicFiles,
  selectedTopicFile,
  onSelectTopicFile,
  topics,
  customTopics,
  onRemoveCustomTopic,
  activeTopic,
  status,
  onSelectTopic,
  onAsk,
  onConclude,
  onOpenSettings,
  onOpenCustomTopic,
  debateStyles,
  activeStyle,
  onSelectStyle,
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

      {/* Topic-file selector */}
      {topicFiles.length > 1 && (
        <div className="shrink-0 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-1.5">
            Topic Set
          </p>
          <select
            value={selectedTopicFile?.file ?? ""}
            onChange={(e) => onSelectTopicFile(e.target.value)}
            className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-moderator-avatar/40 cursor-pointer"
          >
            {topicFiles.map((tf) => (
              <option key={tf.file} value={tf.file}>{tf.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Debate style picker */}
      <div className="shrink-0 px-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-1.5">
          Debate Style
        </p>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {debateStyles.map((style, i) => (
            <button
              key={style.id}
              onClick={() => onSelectStyle(style)}
              className={[
                "flex-1 py-1.5 px-2 transition-colors leading-none",
                i > 0 ? "border-l border-border" : "",
                activeStyle.id === style.id
                  ? "bg-moderator-bg text-moderator-text font-semibold"
                  : "bg-white text-ink hover:bg-surface",
              ].join(" ")}
              title={`Switch to ${style.label} — takes effect on next debate`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {/* Custom topic entry */}
        <button
          onClick={() => {
            setDrawerOpen(false);
            onOpenCustomTopic();
          }}
          className="w-full text-left rounded-lg px-3 py-2.5 mb-3 text-sm transition-colors border border-dashed border-border hover:border-moderator-avatar/40"
          title="Enter your own debate topic"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <span className="font-medium text-ink/80">Custom Topic</span>
          </div>
          <span className="block text-[10px] mt-1 text-muted/60">Type any topic to debate</span>
        </button>

        {/* Previously entered topics */}
        {customTopics.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-2">
              Your Topics
            </p>
            <ul className="space-y-0.5 mb-3">
              {customTopics.map((topic) => (
                <li key={topic.id} className="group/row relative">
                  <TopicButton
                    topic={topic}
                    isActive={activeTopic?.id === topic.id}
                    onSelect={() => {
                      onSelectTopic(topic);
                      setDrawerOpen(false);
                    }}
                  />
                  <button
                    onClick={() => onRemoveCustomTopic(topic.id)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover/row:opacity-100 focus:opacity-100 text-muted hover:text-red-600 text-xs w-5 h-5 rounded flex items-center justify-center hover:bg-white transition-opacity"
                    title="Remove from this list"
                    aria-label={`Remove ${topic.title}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Topics from the selected .yml file */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-2">
          {selectedTopicFile?.label ?? "Topics"}
        </p>
        <ul className="space-y-0.5">
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicButton
                topic={topic}
                isActive={activeTopic?.id === topic.id}
                onSelect={() => {
                  onSelectTopic(topic);
                  setDrawerOpen(false);
                }}
              />
            </li>
          ))}
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

// ── Topic row (shared by file topics and manually entered ones) ───────────────

function TopicButton({
  topic, isActive, onSelect,
}: {
  topic: Topic;
  isActive: boolean;
  onSelect: () => void;
}) {
  const register = resolveRegister(topic.register);
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left rounded-lg px-3 py-2.5 pr-7 text-sm transition-colors group",
        isActive
          ? "bg-moderator-bg text-moderator-text font-medium"
          : "text-ink hover:bg-white",
      ].join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="flex items-center gap-1.5 leading-snug">
        <span className="min-w-0">{topic.title}</span>
        <RegisterBadge register={register} />
      </span>
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
  );
}

/** Pill showing how a topic will be fought (SERIOUS / FRIVOLOUS). */
function RegisterBadge({ register }: { register: "serious" | "frivolous" }) {
  return (
    <span
      title={register === "frivolous" ? "Playful — comedy licence, no real stakes" : "Real stakes — sincere, evidence-facing"}
      className={[
        "shrink-0 inline-block text-[9px] font-semibold uppercase tracking-wider",
        "px-1.5 py-0.5 rounded-full border leading-none",
        register === "frivolous"
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-slate-300 bg-white text-slate-600",
      ].join(" ")}
    >
      {register === "frivolous" ? "Playful" : "Serious"}
    </span>
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
