import { createElement } from "react";
import { AgentNames, Message, Topic } from "../types";
import { Markdown } from "../components/Markdown";

/** Escapes text that goes into the cover page, which is not markdown. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders each message body with the same Markdown component the transcript
 * uses, so the PDF matches what was on screen — links, tables, images and all.
 * react-dom/server is imported on demand, keeping ~23 kB out of the main bundle
 * for everyone who never exports.
 */
async function renderBodies(messages: Message[]): Promise<string[]> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return messages.map((msg) =>
    renderToStaticMarkup(createElement(Markdown, { content: msg.content.trim() })),
  );
}

// ── Color palette (matches app theme) ────────────────────────────────────────

const AGENT_COLORS: Record<string, { bg: string; border: string; name: string; initial: string }> = {
  moderator: { bg: "#EFF6FF", border: "#BFDBFE", name: "#1D4ED8", initial: "#3B82F6" },
  advocate:  { bg: "#F0FDF4", border: "#BBF7D0", name: "#15803D", initial: "#22C55E" },
  critic:    { bg: "#FFF7ED", border: "#FED7AA", name: "#C2410C", initial: "#F97316" },
  audience:  { bg: "#FAF5FF", border: "#E9D5FF", name: "#7E22CE", initial: "#A855F7" },
};

// ── Build the print HTML document ─────────────────────────────────────────────

function buildPrintHTML(
  topic: Topic,
  messages: Message[],
  agentNames: AgentNames,
  bodies: string[],
): string {
  const now = new Date().toISOString().slice(0, 10);
  const turnCount = messages.filter((m) => m.agent !== "audience").length;

  const labelFor: Record<string, string> = {
    moderator: `${agentNames.moderator.name}`,
    advocate:  `${agentNames.advocate.name}`,
    critic:    `${agentNames.critic.name}`,
    audience:  "Audience",
  };
  const roleFor: Record<string, string> = {
    moderator: "Moderator",
    advocate:  "Advocate",
    critic:    "Critic",
    audience:  "Question",
  };
  const initialFor: Record<string, string> = {
    moderator: agentNames.moderator.initial,
    advocate:  agentNames.advocate.initial,
    critic:    agentNames.critic.initial,
    audience:  "?",
  };

  const messageBlocks = messages.map((msg, i) => {
    const c = AGENT_COLORS[msg.agent] ?? AGENT_COLORS.audience;
    const label = labelFor[msg.agent] ?? msg.agent;
    const role  = roleFor[msg.agent] ?? "";
    const init  = initialFor[msg.agent] ?? "?";
    const ts    = msg.timestamp.slice(0, 16).replace("T", " ") + " UTC";
    const body  = bodies[i] ?? "";
    const isAudience = msg.agent === "audience";

    return `
    <div class="message" style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:30px;height:30px;border-radius:50%;background:${c.initial};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${init}</div>
        <div>
          <span style="font-weight:600;color:${c.name};font-size:13px;">${escapeHtml(label)}</span>
          ${role ? `<span style="color:#9CA3AF;font-size:11px;margin-left:6px;">${role}</span>` : ""}
          <span style="color:#D1D5DB;font-size:11px;margin-left:6px;">·</span>
          <span style="color:#9CA3AF;font-size:11px;margin-left:4px;">Turn ${msg.turn}</span>
        </div>
        <div style="margin-left:auto;color:#9CA3AF;font-size:10px;">${ts}</div>
      </div>
      <div style="font-size:12.5px;line-height:1.65;color:#374151;${isAudience ? "font-style:italic;" : ""}">${body}</div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Debate: ${escapeHtml(topic.title)}</title>
<style>
  @page {
    margin: 0.85in 0.9in;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #9CA3AF; }
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1A1A1A;
    margin: 0;
    padding: 0;
  }
  .cover {
    border-bottom: 3px solid #1D4ED8;
    padding-bottom: 18pt;
    margin-bottom: 24pt;
  }
  .cover-eyebrow {
    font-size: 9pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6B7280;
    margin-bottom: 6pt;
  }
  .cover-title {
    font-size: 20pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.25;
    margin: 0 0 12pt;
  }
  .cover-desc {
    font-size: 11pt;
    color: #4B5563;
    font-style: italic;
    margin: 0 0 14pt;
    line-height: 1.5;
  }
  .meta-table {
    border-collapse: collapse;
    font-size: 10pt;
  }
  .meta-table td {
    padding: 3pt 12pt 3pt 0;
    color: #6B7280;
  }
  .meta-table td:first-child {
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
  }
  .participants {
    display: flex;
    gap: 12pt;
    flex-wrap: wrap;
    margin-top: 10pt;
  }
  .participant {
    display: flex;
    align-items: center;
    gap: 6pt;
    font-size: 10pt;
  }
  .participant-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .section-heading {
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6B7280;
    border-bottom: 1px solid #E5E7EB;
    padding-bottom: 4pt;
    margin: 20pt 0 12pt;
  }
  /* Markdown bodies — mirrors the on-screen renderer for print. */
  .message p { margin: 0 0 6px; }
  .message h1, .message h2, .message h3,
  .message h4, .message h5, .message h6 { margin: 8px 0 4px; font-size: 12.5px; font-weight: 600; }
  .message ul, .message ol { margin: 4px 0 6px 18px; padding: 0; }
  .message li { margin-bottom: 3px; }
  .message a { color: #1D4ED8; text-decoration: underline; word-break: break-word; }
  /* Links are not clickable on paper — print the destination after them. */
  .message a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 9px;
    color: #6B7280;
    word-break: break-all;
  }
  .message img { max-width: 100%; height: auto; border: 1px solid #E5E7EB; border-radius: 6px; margin: 6px 0; display: block; }
  .message table { border-collapse: collapse; width: 100%; font-size: 11px; margin: 6px 0; }
  .message th, .message td { border: 1px solid #E5E7EB; padding: 4px 6px; text-align: left; vertical-align: top; }
  .message th { background: rgba(0,0,0,0.03); font-weight: 600; }
  .message pre { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px; overflow-x: auto; font-size: 10.5px; margin: 6px 0; white-space: pre-wrap; word-break: break-word; }
  .message code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; background: rgba(0,0,0,0.05); padding: 1px 3px; border-radius: 3px; }
  .message pre code { background: none; padding: 0; font-size: inherit; }
  .message blockquote { border-left: 2px solid #E5E7EB; padding-left: 10px; margin: 6px 0; color: #4B5563; font-style: italic; }
  .message hr { border: none; border-top: 1px solid #E5E7EB; margin: 8px 0; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">YuktiAI · Debate Transcript</div>
  <h1 class="cover-title">${escapeHtml(topic.title)}</h1>
  ${topic.description ? `<p class="cover-desc">${escapeHtml(topic.description)}</p>` : ""}
  <table class="meta-table">
    <tr><td>Date</td><td>${now}</td></tr>
    <tr><td>Turns</td><td>${turnCount}</td></tr>
    <tr><td>Moderator</td><td>${escapeHtml(agentNames.moderator.name)}</td></tr>
    <tr><td>Advocate</td><td>${escapeHtml(agentNames.advocate.name)}</td></tr>
    <tr><td>Critic</td><td>${escapeHtml(agentNames.critic.name)}</td></tr>
  </table>
</div>

<div class="section-heading">Transcript</div>

${messageBlocks}

</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function printDebatePDF(topic: Topic, messages: Message[], agentNames: AgentNames): void {
  // Open synchronously, inside the click's user-gesture window — awaiting the
  // markdown renderer first would get the pop-up blocked.
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Pop-up blocked — please allow pop-ups for this site to export the PDF.");
    return;
  }
  win.document.write("<!DOCTYPE html><title>Preparing transcript…</title>");

  void (async () => {
    try {
      const bodies = await renderBodies(messages);
      win.document.open();
      win.document.write(buildPrintHTML(topic, messages, agentNames, bodies));
      win.document.close();
      await waitForImages(win);
      win.focus();
      win.print();
    } catch (err) {
      win.document.body.textContent = `Could not build the transcript: ${(err as Error).message}`;
    }
  })();
}

/**
 * Resolves once every image has settled, so responses that embed one don't
 * print as blank boxes. Gives up after 5s rather than blocking the export.
 */
function waitForImages(win: Window): Promise<void> {
  const images = Array.from(win.document.images).filter((img) => !img.complete);
  if (images.length === 0) return new Promise((resolve) => setTimeout(resolve, 50));

  return new Promise((resolve) => {
    let remaining = images.length;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const tick = () => { if (--remaining <= 0) finish(); };

    for (const img of images) {
      img.addEventListener("load", tick, { once: true });
      img.addEventListener("error", tick, { once: true });
    }
    setTimeout(finish, 5000);
  });
}
