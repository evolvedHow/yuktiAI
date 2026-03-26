import { Message, Topic } from "../types";

export function buildMarkdown(topic: Topic, messages: Message[]): string {
  const now = new Date().toISOString().slice(0, 10);
  const agentNames: Record<string, string> = {
    moderator: "Arya (Moderator)",
    advocate: "Priya (Advocate)",
    critic: "Kiran (Critic)",
    audience: "Audience",
  };

  const lines: string[] = [
    `# Debate: ${topic.title}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Date | ${now} |`,
    `| Turns | ${messages.filter((m) => m.agent !== "audience").length} |`,
    "",
    `## Topic`,
    "",
    topic.description,
    "",
    `## Transcript`,
    "",
  ];

  for (const msg of messages) {
    const label = agentNames[msg.agent] ?? msg.agent;
    const ts = msg.timestamp.slice(0, 19).replace("T", " ");
    lines.push(`### Turn ${msg.turn} — ${label}`);
    lines.push(`*${ts} UTC*`);
    lines.push("");
    lines.push(msg.content.trim());
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(topic: Topic, messages: Message[]): void {
  const md = buildMarkdown(topic, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `debate-${topic.id}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
