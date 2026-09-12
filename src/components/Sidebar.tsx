/**
 * Left sidebar:
 *   - YuktiAI branding
 *   - Topic-file dropdown (select which .yml file to load)
 *   - Search box over topics
 *   - Topic list (scrollable) — each row shows a tone radio (Serious/Jovial/
 *     Informal), usage & like/dislike stats, and edit/remove for managed topics
 *   - Custom topic entry option
 *   - Audience controls (pinned to bottom)
 *   - On mobile: becomes a slide-in drawer triggered by a hamburger button
 */
import { useMemo, useState } from "react";
import {
  DebateStatus, DebateStyle, resolveTone, Topic, TopicFileEntry,
  TopicTone, TopicToneMap, TopicVote, TopicVoteMap, TONE_DEFS,
} from "../types";
import { AudienceControls } from "./AudienceControls";

interface Props {
  topicFiles: TopicFileEntry[];
  selectedTopicFile: TopicFileEntry | null;
  onSelectTopicFile: (file: string) => void;
  topics: Topic[];
  /** Manually entered topics, persisted in this browser. */
  customTopics: Topic[];
  /** Per-topic stats + tone override (merged over file and managed topics). */
  topicMeta: TopicToneMap;
  /** This browser's own vote on each topic. */
  topicVotes: TopicVoteMap;
  onSetTopicTone: (id: string, tone: TopicTone) => void;
  onVoteTopic: (id: string, vote: Exclude<TopicVote, null>) => void;
  onEditTopic: (topic: Topic) => void;
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
  topicMeta,
  topicVotes,
  onSetTopicTone,
  onVoteTopic,
  onEditTopic,
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
  const [query, setQuery] = useState("");

  // Fold a topic's stored meta into it for display & tone.
  const withMeta = (topic: Topic): Topic => {
    const meta = topicMeta[topic.id];
    if (!meta) return topic;
    return {
      ...topic,
      tone: meta.tone ?? topic.tone,
      uses: meta.uses,
      likes: meta.likes,
      dislikes: meta.dislikes,
      lastUsedAt: meta.lastUsedAt ?? topic.lastUsedAt,
    };
  };

  const visibleCustom = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: Topic) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.keywords ?? []).some((k) => k.toLowerCase().includes(q));
    return customTopics.map(withMeta).filter(match);
  }, [customTopics, topicMeta, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleFile = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: Topic) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.keywords ?? []).some((k) => k.toLowerCase().includes(q));
    return topics.map(withMeta).filter(match);
  }, [topics, topicMeta, query]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            className="w-full text-xs border border-border rounded-lg pl-7 pr-2.5 py-1.5 bg-white text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-moderator-avatar/40"
          />
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
          title="Add your own debate topic"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <span className="font-medium text-ink/80">Add Topic</span>
          </div>
          <span className="block text-[10px] mt-1 text-muted/60">Type a topic, pick a tone, optionally review &amp; refine with AI</span>
        </button>

        {/* Managed topics */}
        {visibleCustom.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-2">
              My Topics
            </p>
            <ul className="space-y-0.5 mb-3">
              {visibleCustom.map((topic) => (
                <li key={topic.id}>
                  <TopicRow
                    topic={topic}
                    isActive={activeTopic?.id === topic.id}
                    owned
                    vote={topicVotes[topic.id] ?? null}
                    onSelect={() => {
                      onSelectTopic(topic);
                      setDrawerOpen(false);
                    }}
                    onSetTone={(t) => onSetTopicTone(topic.id, t)}
                    onVote={(v) => onVoteTopic(topic.id, v)}
                    onEdit={() => onEditTopic(topic)}
                    onRemove={() => {
                      if (window.confirm(`Remove "${topic.title}" from My Topics?`)) {
                        onRemoveCustomTopic(topic.id);
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {query && visibleCustom.length === 0 && visibleFile.length === 0 && (
          <p className="text-[11px] text-muted px-2 py-3">No topics match “{query}”.</p>
        )}

        {/* Topics from the selected .yml file */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 mb-2">
          {selectedTopicFile?.label ?? "Topics"}
        </p>
        <ul className="space-y-0.5">
          {visibleFile.map((topic) => (
            <li key={topic.id}>
              <TopicRow
                topic={topic}
                isActive={activeTopic?.id === topic.id}
                owned={false}
                vote={topicVotes[topic.id] ?? null}
                onSelect={() => {
                  onSelectTopic(topic);
                  setDrawerOpen(false);
                }}
                onSetTone={(t) => onSetTopicTone(topic.id, t)}
                onVote={(v) => onVoteTopic(topic.id, v)}
                onEdit={() => onEditTopic(topic)}
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

// ── Topic row ────────────────────────────────────────────────────────────────

function TopicRow({
  topic, isActive, owned, vote, onSelect, onSetTone, onVote, onEdit, onRemove,
}: {
  topic: Topic;
  isActive: boolean;
  owned: boolean;
  vote: TopicVote;
  onSelect: () => void;
  onSetTone: (tone: TopicTone) => void;
  onVote: (vote: Exclude<TopicVote, null>) => void;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const tone = resolveTone(topic.tone);
  const activeCls = isActive
    ? "bg-moderator-bg border-moderator-border"
    : "bg-transparent border-transparent hover:bg-white hover:border-border";

  return (
    <div className={`rounded-lg border px-3 pt-2 pb-2 transition-colors ${activeCls}`} aria-current={isActive ? "page" : undefined}>
      {/* Clickable title area */}
      <button
        onClick={onSelect}
        className="w-full text-left group"
        aria-label={`Start debate: ${topic.title}`}
      >
        <span className="flex items-center gap-1.5 leading-snug text-sm">
          <span className="min-w-0 font-medium">{topic.title}</span>
          <ToneBadge tone={tone} />
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

      {/* Tone radio + stats */}
      <div className="flex items-center gap-1 mt-1.5">
        {TONE_DEFS.map((def) => (
          <button
            key={def.id}
            onClick={() => onSetTone(def.id)}
            title={def.tagline}
            aria-pressed={tone === def.id}
            className={[
              "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border transition-colors",
              tone === def.id
                ? "border-moderator-avatar bg-moderator-avatar/15 text-moderator-text"
                : "border-transparent text-muted/70 hover:border-border hover:text-ink",
            ].join(" ")}
          >
            {def.label}
          </button>
        ))}

        {/* stats — small print below each topic */}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted">
          <span title="Times debated" className="tabular-nums">▶ {(topic.uses ?? 0)}</span>
          <button
            onClick={() => onVote("like")}
            title="Liked this debate"
            aria-pressed={vote === "like"}
            className={vote === "like" ? "text-green-700 font-semibold" : "hover:text-ink transition-colors"}
          >
            👍 <span className="tabular-nums">{topic.likes ?? 0}</span>
          </button>
          <button
            onClick={() => onVote("dislike")}
            title="Disliked this debate"
            aria-pressed={vote === "dislike"}
            className={vote === "dislike" ? "text-red-700 font-semibold" : "hover:text-ink transition-colors"}
          >
            👎 <span className="tabular-nums">{topic.dislikes ?? 0}</span>
          </button>
          {owned && (
            <>
              <button
                onClick={onEdit}
                title="Edit this topic"
                className="hover:text-ink transition-colors ml-1"
              >
                ✎
              </button>
              <button
                onClick={onRemove}
                title="Remove this topic"
                className="hover:text-red-600 transition-colors"
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** Pill showing the chosen tone for this topic. */
function ToneBadge({ tone }: { tone: TopicTone }) {
  const def = TONE_DEFS.find((t) => t.id === tone) ?? TONE_DEFS[0];
  const cls = tone === "serious"
    ? "border-slate-300 bg-white text-slate-600"
    : tone === "jovial"
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-sky-300 bg-sky-50 text-sky-700";
  return (
    <span
      title={def.tagline}
      className={`shrink-0 inline-block text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border leading-none ${cls}`}
    >
      {def.label}
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