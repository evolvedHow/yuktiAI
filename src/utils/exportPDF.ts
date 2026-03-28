import { AgentNames, Message, Topic } from "../types";

// ── Minimal markdown → HTML converter for debate content ─────────────────────

function mdToHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings
    if (/^### /.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h4>${inlineFormat(line.slice(4))}</h4>`);
      continue;
    }
    if (/^## /.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3>${inlineFormat(line.slice(3))}</h3>`);
      continue;
    }
    if (/^# /.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${inlineFormat(line.slice(2))}</h2>`);
      continue;
    }

    // Bullet list items (- or *)
    if (/^[-*] /.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }

    // Numbered list (1. 2. etc.)
    if (/^\d+\. /.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ""))}</li>`);
      continue;
    }

    // End list on blank line or non-list content
    if (inList) { out.push("</ul>"); inList = false; }

    if (line === "") {
      out.push("<br>");
    } else {
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  if (inList) out.push("</ul>");
  return out.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

// ── Color palette (matches app theme) ────────────────────────────────────────

const AGENT_COLORS: Record<string, { bg: string; border: string; name: string; initial: string }> = {
  moderator: { bg: "#EFF6FF", border: "#BFDBFE", name: "#1D4ED8", initial: "#3B82F6" },
  advocate:  { bg: "#F0FDF4", border: "#BBF7D0", name: "#15803D", initial: "#22C55E" },
  critic:    { bg: "#FFF7ED", border: "#FED7AA", name: "#C2410C", initial: "#F97316" },
  audience:  { bg: "#FAF5FF", border: "#E9D5FF", name: "#7E22CE", initial: "#A855F7" },
};

// ── Build the print HTML document ─────────────────────────────────────────────

function buildPrintHTML(topic: Topic, messages: Message[], agentNames: AgentNames): string {
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

  const messageBlocks = messages.map((msg) => {
    const c = AGENT_COLORS[msg.agent] ?? AGENT_COLORS.audience;
    const label = labelFor[msg.agent] ?? msg.agent;
    const role  = roleFor[msg.agent] ?? "";
    const init  = initialFor[msg.agent] ?? "?";
    const ts    = msg.timestamp.slice(0, 16).replace("T", " ") + " UTC";
    const body  = mdToHtml(msg.content.trim());
    const isAudience = msg.agent === "audience";

    return `
    <div class="message" style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:30px;height:30px;border-radius:50%;background:${c.initial};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${init}</div>
        <div>
          <span style="font-weight:600;color:${c.name};font-size:13px;">${label}</span>
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
<title>Debate: ${topic.title}</title>
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
  .message p { margin: 0 0 6px; }
  .message h2, .message h3, .message h4 { margin: 8px 0 4px; font-size: 12.5px; }
  .message ul { margin: 4px 0 6px 18px; padding: 0; }
  .message li { margin-bottom: 3px; }
  .message br { display: block; margin: 4px 0; content: ""; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">YuktiAI · Debate Transcript</div>
  <h1 class="cover-title">${topic.title}</h1>
  ${topic.description ? `<p class="cover-desc">${topic.description}</p>` : ""}
  <table class="meta-table">
    <tr><td>Date</td><td>${now}</td></tr>
    <tr><td>Turns</td><td>${turnCount}</td></tr>
    <tr><td>Moderator</td><td>${agentNames.moderator.name}</td></tr>
    <tr><td>Advocate</td><td>${agentNames.advocate.name}</td></tr>
    <tr><td>Critic</td><td>${agentNames.critic.name}</td></tr>
  </table>
</div>

<div class="section-heading">Transcript</div>

${messageBlocks}

</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function printDebatePDF(topic: Topic, messages: Message[], agentNames: AgentNames): void {
  const html = buildPrintHTML(topic, messages, agentNames);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Pop-up blocked — please allow pop-ups for this site to export the PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
  // Give the browser a moment to render before opening the print dialog
  win.addEventListener("load", () => {
    win.focus();
    win.print();
  });
}
