/**
 * Topic-review agent — refines a raw user topic prompt into a robust debate brief.
 *
 * The user types whatever is on their mind ("should we ban crypto ads?"); this runs it
 * through a dedicated persona (public/agents/topic-reviewer.md) that returns a tightened
 * title, neutral framing and search keywords. The refined result is shown back to the
 * user in the topic editor before anything is saved, so the model edits their words but
 * never silently replaces their intent.
 *
 * Tone is not part of this flow — it is a single global, real-time user setting.
 *
 * The review runs through the same gateway as the debates do, so it is
 * unavailable until the gateway responds — the modal tells the user exactly that.
 */

import { LLMSettings } from "../types";
import { streamChat } from "./llmClient";
import { resolveEndpoint } from "./gateway";

export interface TopicReviewResult {
  title: string;
  description: string;
  keywords: string[];
  /** Human note about what the agent changed / thought ambiguous. */
  rationale: string;
}

export interface TopicReviewRequest {
  /** Raw title the user typed. Required. */
  title: string;
  /** Optional raw description/framing the user typed. */
  description?: string;
  /** The topic-reviewer persona (public/agents/topic-reviewer.md), loaded once. */
  persona: string;
  settings: LLMSettings;
  signal?: AbortSignal;
}

/** Pulls the JSON object out of a model reply (prose/fence tolerant). */
function extractJsonObject(raw: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const parsed = JSON.parse(candidate.trim()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through to brace-slice */
  }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model reply");
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

export async function reviewTopicPrompt(req: TopicReviewRequest): Promise<TopicReviewResult> {
  const endpoint = resolveEndpoint(req.settings);
  const persona = req.persona.trim() ||
    "You are a topic intake editor. Turn the user's debate topic into a tight motion, neutral framing, and search keywords. Reply with JSON only: { title, description, keywords, rationale }.";

  const userMessage =
    `Raw debate topic from a user:\n\n---\n${req.title.trim()}\n\n` +
    `${(req.description ?? "").trim()}\n---\n\n` +
    `Sharpen, scope and keyword this. Reply with the JSON object only.`;

  let raw = "";
  for await (const token of streamChat({
    baseUrl: endpoint.baseUrl,
    model: req.settings.model,
    messages: [
      { role: "system", content: persona },
      { role: "user", content: userMessage },
    ],
    maxTokens: 600,
    temperature: 0.5,
    headers: endpoint.headers,
    signal: req.signal,
  })) {
    raw += token;
  }

  const parsed = extractJsonObject(raw);

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : req.title.trim();
  const description = typeof parsed.description === "string" && parsed.description.trim()
    ? parsed.description.trim()
    : (req.description ?? "").trim();
  const keywords = Array.isArray(parsed.keywords)
    ? (parsed.keywords as unknown[])
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim().toLowerCase())
    : [];
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";

  return { title, description, keywords, rationale };
}