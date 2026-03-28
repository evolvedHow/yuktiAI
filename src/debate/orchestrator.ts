/**
 * Client-side debate orchestrator.
 *
 * Drives the full debate lifecycle in the browser:
 *   Turn 0     → Moderator opening statement
 *   Turn 1–N   → Advocate → Critic → Moderator summary (repeating)
 *   Conclusion → Moderator structured closing (on conclude flag or max_turns)
 *
 * All LLM calls go through streamChat() — no server required.
 */
import { streamChat, ChatMessage } from "./llmClient";
import { AgentId, AgentNames, DEFAULT_AGENT_NAMES, LLMSettings, Topic } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CYCLE: AgentId[] = ["advocate", "critic", "moderator"];

const CONCLUSION_PROMPT = `It is now time to conclude this debate.

Please deliver a structured closing summary with exactly these sections:
1. **Key arguments from the Advocate** — 2–3 bullet points
2. **Key arguments from the Critic** — 2–3 bullet points
3. **Central agreement or unresolved tension** — 1–2 sentences
4. **A closing question for the audience** — one thought-provoking question
5. **Closing thanks** — 1–2 warm sentences thanking participants and the audience

Be concise, fair, and neutral.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  agent: AgentId;
  content: string;
}

export interface OrchestratorCallbacks {
  onTurnStart: (agent: AgentId, turn: number) => void;
  onToken: (agent: AgentId, token: string, turn: number) => void;
  onTurnEnd: (agent: AgentId, content: string, turn: number) => void;
  /** Called just before the moderator's question-ack turn, with the question text */
  onQuestionAck: (question: string, turn: number) => void;
  onDone: () => void;
}

export interface OrchestratorControl {
  /** Returns a pending question (or null), then clears it */
  takePendingQuestion: () => string | null;
  /** Returns true if the conclude button was pressed */
  shouldConclude: () => boolean;
  /** AbortSignal — caller cancels this to stop mid-debate */
  signal: AbortSignal;
  /** Called between turns; resolves when the user advances or countdown expires */
  waitForGate: (nextAgent: AgentId) => Promise<void>;
}

// ── Message history builder ───────────────────────────────────────────────────

function buildMessages(
  history: HistoryEntry[],
  currentAgent: AgentId,
  systemPrompt: string,
  bootstrapPrompt?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  for (const entry of history) {
    if (entry.agent === currentAgent) {
      messages.push({ role: "assistant", content: entry.content });
    } else {
      const label = entry.agent.charAt(0).toUpperCase() + entry.agent.slice(1);
      messages.push({ role: "user", content: `[${label}]: ${entry.content}` });
    }
  }

  if (bootstrapPrompt) {
    messages.push({ role: "user", content: bootstrapPrompt });
  } else if (history.length === 0) {
    // Very first call — no history yet
    messages.push({
      role: "user",
      content: "Please begin now.",
    });
  }

  return messages;
}

// ── Single-turn runner ────────────────────────────────────────────────────────

async function runTurn(
  agent: AgentId,
  turn: number,
  persona: string,
  topic: Topic,
  history: HistoryEntry[],
  settings: LLMSettings,
  callbacks: OrchestratorCallbacks,
  control: OrchestratorControl,
  promptSuffix = "",
  bootstrapPrompt?: string,
): Promise<string> {
  const topicCtx =
    `\n\nDebate topic: **${topic.title}**\n` +
    (topic.description ? `Context: ${topic.description}` : "");

  const systemPrompt =
    persona.trim() + topicCtx + (promptSuffix ? `\n\n${promptSuffix}` : "");

  const messages = buildMessages(history, agent, systemPrompt, bootstrapPrompt);

  callbacks.onTurnStart(agent, turn);

  let full = "";

  try {
    for await (const token of streamChat(
      settings.baseUrl,
      settings.apiKey,
      settings.model,
      messages,
      settings.maxTokensPerTurn,
      control.signal,
    )) {
      full += token;
      callbacks.onToken(agent, token, turn);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const msg = `[Error: ${(err as Error).message}]`;
    full = msg;
    callbacks.onToken(agent, msg, turn);
  }

  callbacks.onTurnEnd(agent, full, turn);
  history.push({ agent, content: full });
  return full;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runDebate(
  topic: Topic,
  personas: Record<AgentId, string>,
  settings: LLMSettings,
  callbacks: OrchestratorCallbacks,
  control: OrchestratorControl,
): Promise<void> {
  const history: HistoryEntry[] = [];

  let turn = 0;

  // ── Turn 0: Moderator opening ────────────────────────────────────────────
  await runTurn(
    "moderator", turn, personas.moderator, topic, history, settings, callbacks, control,
    "",
    `Please open the debate on the following topic:\n\n**${topic.title}**\n\n${topic.description}`,
  );
  turn++;
  await control.waitForGate(CYCLE[0]);

  // ── Main loop ─────────────────────────────────────────────────────────────
  let concluded = false;

  while (turn <= settings.maxTurns) {
    const agentId = CYCLE[(turn - 1) % 3];
    let suffix = "";

    // Inject pending audience question on moderator's turn
    const pendingQ = agentId === "moderator" ? control.takePendingQuestion() : null;
    if (pendingQ) {
      callbacks.onQuestionAck(pendingQ, turn);
      suffix =
        `An audience member has submitted this question:\n\n"${pendingQ}"\n\n` +
        `Please acknowledge this question, explain its relevance to the debate, ` +
        `and invite both the Advocate and the Critic to respond.`;
    }

    // Conclusion on moderator's turn
    if (agentId === "moderator" && control.shouldConclude()) {
      await runTurn(
        "moderator", turn, personas.moderator, topic, history, settings, callbacks, control,
        CONCLUSION_PROMPT,
      );
      turn++;
      concluded = true;
      break;
    }

    await runTurn(
      agentId, turn, personas[agentId], topic, history, settings, callbacks, control,
      suffix,
    );
    turn++;
    const nextAgentInCycle = CYCLE[(turn - 1) % 3];
    await control.waitForGate(nextAgentInCycle);
  }

  // Auto-close if max_turns hit
  if (!concluded) {
    await runTurn(
      "moderator", turn, personas.moderator, topic, history, settings, callbacks, control,
      `We have reached the end of our allotted debate time.\n\n${CONCLUSION_PROMPT}`,
    );
  }

  callbacks.onDone();
}

// ── Persona loader ────────────────────────────────────────────────────────────
// Agent names are defined solely in the topics .yml files.
// The .md files contain only the system-prompt body — no frontmatter.

export async function loadPersonas(
  basePath: string,
): Promise<{ personas: Record<AgentId, string>; agentNames: AgentNames }> {
  const agents: AgentId[] = ["moderator", "advocate", "critic"];
  const results = await Promise.all(
    agents.map(async (id) => {
      const res = await fetch(`${basePath}/agents/${id}.md`);
      if (!res.ok) throw new Error(`Could not load persona: ${id}.md`);
      return { id, body: await res.text() };
    }),
  );

  const personas: Partial<Record<AgentId, string>> = {};
  for (const { id, body } of results) {
    personas[id] = body;
  }

  return {
    personas: personas as Record<AgentId, string>,
    agentNames: { ...DEFAULT_AGENT_NAMES },
  };
}
