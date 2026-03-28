import React from "react";
import { AgentId, AgentNames, Message } from "../types";

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

// ── Streaming cursor ──────────────────────────────────────────────────────────

function Cursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  message: Message;
  agentNames: AgentNames;
}

export function MessageCard({ message, agentNames }: Props) {
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

      {/* Body */}
      <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
        {renderMarkdownLight(message.content)}
        {message.streaming && <Cursor />}
      </div>
    </div>
  );
}

// ── Minimal inline-markdown renderer (bold + bullet lists) ────────────────────
// Full markdown via a library would bloat the bundle; these cover agent output.

function renderMarkdownLight(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    // Bullet list
    if (/^[-*]\s/.test(line)) {
      nodes.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="text-muted shrink-0 mt-0.5">•</span>
          <span>{inlineBold(line.slice(2), key)}</span>
        </div>,
      );
    }
    // Heading (###)
    else if (/^###\s/.test(line)) {
      nodes.push(
        <p key={key++} className="font-semibold mt-2 mb-0.5">
          {inlineBold(line.slice(4), key)}
        </p>,
      );
    }
    // Blank line → spacing
    else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-1.5" />);
    }
    // Normal paragraph
    else {
      nodes.push(<p key={key++}>{inlineBold(line, key)}</p>);
    }
  }
  return nodes;
}

function inlineBold(text: string, baseKey: number): React.ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={`${baseKey}-b${i}`} className="font-semibold">{part}</strong>
      : <React.Fragment key={`${baseKey}-t${i}`}>{part}</React.Fragment>,
  );
}
