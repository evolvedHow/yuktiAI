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
import {
  AgentId, AgentNames, DEFAULT_AGENT_NAMES, DebateStyle, Finding, LLMSettings,
  resolveRegister, ReviewState, Topic, TopicRegister, TurnReview,
} from "../types";
import { buildRedoInstruction, reviewTurn } from "./factCheck";
import { resolveEndpoint } from "./gateway";
import { getSessionStyle } from "./styles";

// ── Constants ─────────────────────────────────────────────────────────────────

const CYCLE: AgentId[] = ["advocate", "critic", "moderator"];

/**
 * How many extra times a turn's LLM call is retried when it dies on its feet
 * (connection dropped, gateway hiccup, timeout). One failed call doesn't kill a
 * debate, but after this many consecutive failures the debate is stopped rather
 * than replaying error cards for every remaining turn.
 */
const MAX_CONNECT_RETRIES = 2;

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
  /**
   * May return a promise — the orchestrator awaits it before starting the next
   * LLM call. That is what lets the typewriter reveal finish on screen before
   * the following speaker begins.
   */
  onTurnEnd: (agent: AgentId, content: string, turn: number) => void | Promise<void>;
  /** Called just before the moderator's question-ack turn, with the question text */
  onQuestionAck: (question: string, turn: number) => void;
  /** Fact-check stage changed for the turn in progress. */
  onReviewStage?: (stage: ReviewState) => void;
  /** The turn was rejected by the fact-checker and is about to be re-delivered — clear the message. */
  onTurnRedo?: (agent: AgentId, turn: number, attempt: number) => void;
  /** The LLM call failed on the wire; we're wiping and trying the connection again. */
  onTurnRetry?: (agent: AgentId, turn: number, attempt: number) => void;
  /** Final review for the turn, once it has been accepted. */
  onReview?: (agent: AgentId, turn: number, review: TurnReview) => void;
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

// ── Style block builder ───────────────────────────────────────────────────────

/**
 * Returns the style injection block for a given agent, or "" when:
 *   - The active style is plain English (no communication_arch), or
 *   - The agent is the moderator and style.moderatorApplies is false.
 */
function buildStyleBlock(style: DebateStyle, agentId: AgentId): string {
  if (!style.communication_arch) return "";
  if (agentId === "moderator" && !style.moderatorApplies) return "";

  const lm = style.language_module!;
  return (
    `\n\n[Communication Style — ${lm.label}]\n` +
    `${style.communication_arch}\n\n` +
    `Language pair: ${lm.pair}. Region: ${lm.region}. Script: ${lm.script}.\n` +
    `Common expressions: ${lm.colloquials.join(", ")}.\n` +
    `Grammar patterns:\n` +
    lm.grammar_rules.map((r) => `  • ${r}`).join("\n")
  );
}

// ── Message history builder ───────────────────────────────────────────────────

/** Set on a redo so the model can see its rejected attempt and what to fix. */
interface RedoContext {
  previousAttempt: string;
  instruction: string;
}

function buildMessages(
  history: HistoryEntry[],
  currentAgent: AgentId,
  systemPrompt: string,
  bootstrapPrompt?: string,
  redo?: RedoContext,
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
  } else {
    // Ensure every LLM call ends with a user message so the model knows
    // to generate a response. Without this, agents beyond the first (especially
    // the Critic) may produce empty output when the last history entry is
    // another agent's statement rather than a direct prompt.
    messages.push({ role: "user", content: "Please respond now." });
  }

  // The rejected attempt never enters history — it only exists here, as the
  // thing the correction refers to.
  if (redo) {
    messages.push({ role: "assistant", content: redo.previousAttempt });
    messages.push({ role: "user", content: redo.instruction });
  }

  return messages;
}

// ── Single-turn runner ────────────────────────────────────────────────────────

/** Everything a turn needs that doesn't change between turns. */
interface TurnDeps {
  settings: LLMSettings;
  callbacks: OrchestratorCallbacks;
  control: OrchestratorControl;
  /** Sourcing rules injected into every speaker's system prompt. */
  evidencePolicy: string;
  /** Reviewer system prompt. Empty disables claim review. */
  checkerPersona: string;
  /** Register guidance blocks, keyed by register (see public/agents/register-*.md). */
  registerBlocks?: Partial<Record<TopicRegister, string>>;
  agentNames: AgentNames;
}

/** Streams one attempt at a turn. Errors become visible text, not exceptions. */
async function streamTurn(
  agent: AgentId,
  turn: number,
  messages: ChatMessage[],
  deps: TurnDeps,
): Promise<string> {
  const endpoint = resolveEndpoint(deps.settings);
  let full = "";

  try {
    for await (const token of streamChat({
      baseUrl: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      model: deps.settings.model,
      messages,
      maxTokens: deps.settings.maxTokensPerTurn,
      headers: endpoint.headers,
      signal: deps.control.signal,
    })) {
      full += token;
      deps.callbacks.onToken(agent, token, turn);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const msg = `[Error: ${(err as Error).message}]`;
    full = msg;
    deps.callbacks.onToken(agent, msg, turn);
  }

  // Awaited: the reveal animation must finish before anything else happens.
  await deps.callbacks.onTurnEnd(agent, full, turn);
  return full;
}

/**
 * Delivers one turn, fact-checks it, and re-delivers it if the check rejects it.
 *
 * Only the accepted attempt enters the debate history, so a rejected statement
 * never becomes something later speakers build on.
 */
async function runTurn(
  agent: AgentId,
  turn: number,
  persona: string,
  topic: Topic,
  history: HistoryEntry[],
  deps: TurnDeps,
  promptSuffix = "",
  bootstrapPrompt?: string,
  styleBlock = "",
): Promise<{ content: string; errored: boolean }> {
  const { settings, callbacks, control } = deps;

  // A topic that doesn't pick a register debates as serious.
  const register = resolveRegister(topic.register);
  const registerBlock =
    register === "frivolous" ? deps.registerBlocks?.frivolous : deps.registerBlocks?.serious;

  const topicCtx =
    `\n\nDebate topic: **${topic.title}**\n` +
    (topic.description ? `Context: ${topic.description}` : "") +
    `\nRegister: ${register.toUpperCase()} — this changes your tone, licence, and how strictly you will be fact-checked.`;

  const systemPrompt =
    // Register licence goes first so a topic file's persona_overlay (fused into
    // `persona`) is always the last word on voice — e.g. fdga.yml's explicit
    // "strip all emotional adjectives" mandate overrides the generic SERIOUS
    // block below.
    (registerBlock ? `${registerBlock.trim()}\n\n---\n\n` : "") +
    persona.trim() +
    topicCtx +
    (deps.evidencePolicy ? `\n\n---\n\n${deps.evidencePolicy.trim()}` : "") +
    (styleBlock ? styleBlock : "") +
    (promptSuffix ? `\n\n${promptSuffix}` : "");

  const maxRedos = Math.max(0, settings.factCheck.maxRedos);
  const reviewEnabled = settings.factCheck.verifyLinks || settings.factCheck.reviewClaims;

  let attempt = 0;
  let errorRetries = 0;
  let accepted = "";
  let review: TurnReview | undefined;
  let redo: RedoContext | undefined;
  /** What superseded attempts were rejected for — kept for the audience. */
  const corrected: Finding[] = [];

  let first = true;
  /** True when the previous attempt failed on the wire and the card needs wiping. */
  let pendingRetry = false;

  while (true) {
    if (first) {
      callbacks.onTurnStart(agent, turn);
      first = false;
    } else if (pendingRetry) {
      callbacks.onTurnRetry?.(agent, turn, errorRetries);
      pendingRetry = false;
    } else {
      callbacks.onTurnRedo?.(agent, turn, attempt);
    }

    accepted = await streamTurn(
      agent, turn,
      buildMessages(history, agent, systemPrompt, bootstrapPrompt, redo),
      deps,
    );

    // Wire-level failure (connection dropped, gateway down, timeout). Retry a
    // few times — a single blip shouldn't end the debate — but if it keeps
    // failing, give up on this turn.
    const errored = accepted.startsWith("[Error:");
    if (errored && errorRetries < MAX_CONNECT_RETRIES) {
      errorRetries++;
      pendingRetry = true;
      continue;
    }

    // A failed call has nothing to check, and the reviewer would just object to
    // the error text.
    if (!reviewEnabled || errored || !accepted.trim()) break;

    // reviewTurn emits its own stages — "checking-links" only when the turn
    // actually cited something, otherwise straight to "reviewing".
    review = await reviewTurn(accepted, {
      persona: deps.checkerPersona,
      speaker: deps.agentNames[agent]?.name ?? agent,
      topicTitle: topic.title,
      register,
      settings: {
        ...settings,
        // Claim review is off unless a checker persona actually loaded.
        factCheck: {
          ...settings.factCheck,
          reviewClaims: settings.factCheck.reviewClaims && Boolean(deps.checkerPersona),
        },
      },
      signal: control.signal,
      onStage: (stage) => callbacks.onReviewStage?.(stage),
    });
    review.redos = attempt;

    if (review.verdict !== "rejected" || attempt >= maxRedos) break;

    callbacks.onReviewStage?.("redoing");
    corrected.push(...review.findings.filter((f) => f.severity === "reject"));
    redo = { previousAttempt: accepted, instruction: buildRedoInstruction(review.findings) };
    attempt++;
  }

  callbacks.onReviewStage?.("done");
  if (review) {
    if (corrected.length > 0) review.corrected = corrected;
    callbacks.onReview?.(agent, turn, review);
  }

  // A turn that errored or came back empty stays visible in the transcript but
  // never enters the debate history — nothing for a later speaker to build on,
  // and an error string ("[Error: …]") isn't a position to rebut.
  const finalErrored = accepted.startsWith("[Error:");
  if (!finalErrored && accepted.trim()) {
    history.push({ agent, content: accepted });
  }
  return { content: accepted, errored: finalErrored };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/** Optional prompts and metadata loaded from public/agents/. */
export interface DebateExtras {
  /** public/agents/evidence-policy.md — omitted when the setting is off. */
  evidencePolicy?: string;
  /** public/agents/factchecker.md — omitted disables claim review. */
  checkerPersona?: string;
  /** public/agents/register-serious.md + register-frivolous.md. */
  registerBlocks?: Partial<Record<TopicRegister, string>>;
  agentNames?: AgentNames;
}

export async function runDebate(
  topic: Topic,
  personas: Record<AgentId, string>,
  settings: LLMSettings,
  callbacks: OrchestratorCallbacks,
  control: OrchestratorControl,
  activeStyle?: DebateStyle,
  extras: DebateExtras = {},
): Promise<void> {
  const history: HistoryEntry[] = [];
  // Fall back to the session singleton if no style was passed explicitly
  const style = activeStyle ?? getSessionStyle();

  const deps: TurnDeps = {
    settings,
    callbacks,
    control,
    evidencePolicy: settings.factCheck.evidencePolicy ? (extras.evidencePolicy ?? "") : "",
    checkerPersona: extras.checkerPersona ?? "",
    registerBlocks: extras.registerBlocks,
    agentNames: extras.agentNames ?? DEFAULT_AGENT_NAMES,
  };

  let turn = 0;

  // ── Turn 0: Moderator opening ────────────────────────────────────────────
  const opening = await runTurn(
    "moderator", turn, personas.moderator, topic, history, deps,
    "",
    `Please open the debate on the following topic:\n\n**${topic.title}**\n\n${topic.description}`,
    buildStyleBlock(style, "moderator"),
  );
  // One look at the LLM tells us whether a debate is even possible — if the
  // very first call fails, there is no point stringing the audience along.
  if (opening.errored) {
    callbacks.onDone();
    return;
  }
  turn++;
  await control.waitForGate(CYCLE[0]);

  // ── Main loop ─────────────────────────────────────────────────────────────
  let concluded = false;
  let stopped = false;

  while (turn <= settings.maxTurns) {
    const agentId = CYCLE[(turn - 1) % 3];
    let suffix = "";

    // Inject pending audience question on moderator's turn. Taken once, so it
    // is consumed whether it becomes a question turn or gets folded into a
    // conclusion below.
    const pendingQ = agentId === "moderator" ? control.takePendingQuestion() : null;

    // Conclusion on moderator's turn. A question asked in the final stretch is
    // folded into the closing rather than dropped mid-conversation.
    if (agentId === "moderator" && control.shouldConclude()) {
      const concludePrompt = pendingQ
        ? `${CONCLUSION_PROMPT}\n\nAn audience question was asked in the closing stretch:\n"${pendingQ}"\nAcknowledge it briefly and address it where it fits in the closing.`
        : CONCLUSION_PROMPT;
      await runTurn(
        "moderator", turn, personas.moderator, topic, history, deps,
        concludePrompt,
        undefined,
        buildStyleBlock(style, "moderator"),
      );
      turn++;
      concluded = true;
      break;
    }

    if (pendingQ) {
      callbacks.onQuestionAck(pendingQ, turn);
      suffix =
        `An audience member has submitted this question:\n\n"${pendingQ}"\n\n` +
        `Please acknowledge this question, explain its relevance to the debate, ` +
        `and invite both the Advocate and the Critic to respond.`;
    }

    const result = await runTurn(
      agentId, turn, personas[agentId], topic, history, deps,
      suffix,
      undefined,
      buildStyleBlock(style, agentId),
    );
    turn++;
    // The LLM is unavailable right now — stop the debate instead of playing a
    // tune of error cards for every remaining turn.
    if (result.errored) {
      stopped = true;
      break;
    }
    const nextAgentInCycle = CYCLE[(turn - 1) % 3];
    await control.waitForGate(nextAgentInCycle);
  }

  // Auto-close if max_turns hit — unless a failing LLM already ended the debate.
  if (!concluded && !stopped) {
    await runTurn(
      "moderator", turn, personas.moderator, topic, history, deps,
      `We have reached the end of our allotted debate time.\n\n${CONCLUSION_PROMPT}`,
      undefined,
      buildStyleBlock(style, "moderator"),
    );
  }

  callbacks.onDone();
}

// ── Persona loader ────────────────────────────────────────────────────────────
// Agent names are defined solely in the topics .yml files.
// The .md files contain only the system-prompt body — no frontmatter.

export async function loadPersonas(basePath: string): Promise<{
  personas: Record<AgentId, string>;
  agentNames: AgentNames;
  /** Sourcing rules appended to every speaker's prompt. */
  evidencePolicy: string;
  /** Reviewer prompt. Empty string when the file is absent — claim review is
   *  then skipped rather than run with an improvised prompt. */
  checkerPersona: string;
  /** Register guidance blocks (public/agents/register-*.md). */
  registerBlocks: Partial<Record<TopicRegister, string>>;
}> {
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

  // Optional — a deployment that removes these files just loses the feature.
  const [evidencePolicy, checkerPersona, registerSerious, registerFrivolous] = await Promise.all([
    fetchOptional(`${basePath}/agents/evidence-policy.md`),
    fetchOptional(`${basePath}/agents/factchecker.md`),
    fetchOptional(`${basePath}/agents/register-serious.md`),
    fetchOptional(`${basePath}/agents/register-frivolous.md`),
  ]);

  return {
    personas: personas as Record<AgentId, string>,
    agentNames: { ...DEFAULT_AGENT_NAMES },
    evidencePolicy,
    checkerPersona,
    registerBlocks: { serious: registerSerious, frivolous: registerFrivolous },
  };
}

async function fetchOptional(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}
