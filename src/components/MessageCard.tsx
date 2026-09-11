import { memo } from "react";
import { AgentId, AgentNames, Message } from "../types";
import { Markdown } from "./Markdown";
import { ReviewPanel } from "./ReviewPanel";

// ── Agent style metadata (colors only — names come from .md frontmatter) ──────

const AGENT_STYLE: Record<
  AgentId,
  { role: string; cardCls: string; avatarCls: string; labelCls: string }
> = {
  moderator: {
    role: "Moderator",
    cardCls: "bg-moderator-bg border-moderator-border",
    avatarCls: "bg-moderator-avatar",
    labelCls: "text-moderator-text",
  },
  advocate: {
    role: "Advocate",
    cardCls: "bg-advocate-bg border-advocate-border",
    avatarCls: "bg-advocate-avatar",
    labelCls: "text-advocate-text",
  },
  critic: {
    role: "Critic",
    cardCls: "bg-critic-bg border-critic-border",
    avatarCls: "bg-critic-avatar",
    labelCls: "text-critic-text",
  },
  audience: {
    role: "Audience",
    cardCls: "bg-audience-bg border-audience-border",
    avatarCls: "bg-audience-avatar",
    labelCls: "text-audience-text",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  message: Message;
  agentNames: AgentNames;
}

function MessageCardInner({ message, agentNames }: Props) {
  const style = AGENT_STYLE[message.agent];
  const { name, initial, trait } = agentNames[message.agent];
  // "Narada-Muni · Moderator" — omit role suffix for audience
  const label = message.agent === "audience"
    ? "Audience Question"
    : `${name} · ${style.role}`;
  const ts = message.timestamp.slice(11, 16) + " UTC";

  // Audience card has a slightly different layout — it's a callout
  if (message.agent === "audience") {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${style.cardCls} my-1`}
        role="note"
        aria-label="Audience question"
      >
        <span
          className={`${style.avatarCls} text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shrink-0 mt-0.5`}
        >
          {initial}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold tracking-wide mb-0.5 ${style.labelCls}`}>
            {label}
          </div>
          <p className="text-sm text-ink leading-relaxed italic">
            "{message.content}"
          </p>
        </div>
        <time className="text-[10px] text-muted shrink-0 mt-0.5">{ts}</time>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${style.cardCls} my-1`}
      role="article"
      aria-label={`${label} turn ${message.turn}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`${style.avatarCls} text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shrink-0`}
        >
          {initial}
        </span>
        <span className={`text-sm font-medium ${style.labelCls}`}>{label}</span>
        {trait && (
          <span className={`text-[10px] italic px-1.5 py-0.5 rounded-full border ${style.cardCls} ${style.labelCls} opacity-70`}>
            {trait}
          </span>
        )}
        <span className="text-[10px] text-muted ml-auto">{ts}</span>
      </div>

      {/* Body — the blinking caret while streaming is the ::after rule in
          index.css, so it sits inline at the end of the last block. */}
      <div
        className={`markdown-body text-sm text-ink leading-relaxed break-words ${
          message.streaming ? "is-streaming" : ""
        }`}
      >
        <Markdown content={message.content} links={message.review?.links} />
      </div>

      {message.review && <ReviewPanel review={message.review} />}
    </div>
  );
}

/**
 * Memoised: every revealed chunk replaces the whole message array, which would
 * otherwise re-parse the markdown of every completed turn on each frame.
 */
export const MessageCard = memo(MessageCardInner, (prev, next) =>
  prev.message.content === next.message.content &&
  prev.message.streaming === next.message.streaming &&
  prev.message.review === next.message.review &&
  prev.agentNames === next.agentNames,
);
