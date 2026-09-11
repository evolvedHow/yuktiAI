/**
 * Fact-checking a debate turn.
 *
 * Two mechanisms, deliberately kept apart because they have very different
 * reliability:
 *
 *   1. Link verification — the gateway actually fetches every URL the agent
 *      cited and reports the HTTP result. This is measurement. An LLM asked
 *      "does this link exist?" will answer confidently either way while having
 *      no means to look, so this never goes through a model.
 *
 *   2. Claim review — a reviewer model reads the turn and flags specifics that
 *      look invented: precise figures stated as fact, named studies, direct
 *      quotations, inferences dressed as findings. This is judgement, not
 *      measurement. It catches a lot and it will also miss things and
 *      occasionally object to something true. It is a smoke alarm, not proof.
 *
 * Findings from (1) are generated in code below. The reviewer is explicitly told
 * not to opine on links so the two never get confused.
 */

import {
  BAD_LINK_VERDICTS, Finding, FindingKind, FindingSeverity, LinkCheck,
  LLMSettings, resolveRegister, ReviewVerdict, TopicRegister, TurnReview,
} from "../types";
import { streamChat } from "./llmClient";
import { normalizeGatewayUrl, resolveEndpoint } from "./gateway";

// ── URL extraction ────────────────────────────────────────────────────────────

/** Matches bare and markdown-embedded http(s) URLs. */
const URL_PATTERN = /https?:\/\/[^\s<>()\[\]"'`]+/gi;

/** Trailing punctuation that belongs to the sentence, not the URL. */
const TRAILING_JUNK = /[.,;:!?)\]}>'"]+$/;

/** Every distinct http(s) URL mentioned in a statement, in order of appearance. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_PATTERN) ?? [];
  const cleaned = found.map((raw) => raw.replace(TRAILING_JUNK, "")).filter(Boolean);
  return [...new Set(cleaned)];
}

// ── Link verification (measured) ──────────────────────────────────────────────

/**
 * Asks the gateway to fetch each URL. Returns "unchecked" for everything when no
 * gateway is configured — the browser cannot do this itself, because
 * cross-origin requests to arbitrary sites are blocked by CORS.
 */
export async function verifyLinks(
  urls: string[],
  settings: LLMSettings,
  signal?: AbortSignal,
): Promise<LinkCheck[]> {
  if (urls.length === 0) return [];

  const gateway = normalizeGatewayUrl(settings.backendUrl);
  if (!gateway) {
    return urls.map((url) => ({
      url,
      verdict: "unchecked" as const,
      reason: "no gateway configured — the browser cannot check links itself",
    }));
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.gatewayPasscode) headers["X-Yukti-Passcode"] = settings.gatewayPasscode;

    const res = await fetch(`${gateway}/verify-links`, {
      method: "POST",
      headers,
      body: JSON.stringify({ urls }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`gateway responded ${res.status}`);

    const data = (await res.json()) as { results?: LinkCheck[] };
    const byUrl = new Map((data.results ?? []).map((r) => [r.url, r]));
    return urls.map(
      (url) => byUrl.get(url) ?? { url, verdict: "unchecked" as const, reason: "not returned by gateway" },
    );
  } catch (err) {
    const reason = (err as Error).name === "AbortError"
      ? "link check cancelled"
      : `link check failed: ${(err as Error).message}`;
    return urls.map((url) => ({ url, verdict: "unchecked" as const, reason }));
  }
}

/** Turns measured link results into findings. No model involved. */
export function findingsFromLinks(links: LinkCheck[]): Finding[] {
  return links
    .filter((l) => BAD_LINK_VERDICTS.includes(l.verdict))
    .map((l) => ({
      severity: "reject" as FindingSeverity,
      kind: "dead-link" as FindingKind,
      quote: l.url,
      note: l.verdict === "missing"
        ? `The server returned ${l.httpStatus ?? "404"} — this page does not exist.`
        : `This address did not resolve (${l.reason ?? "no response"}), which usually means the domain or path was invented.`,
    }));
}

// ── Claim review (judgement) ──────────────────────────────────────────────────

const VALID_KINDS: FindingKind[] = [
  "unverifiable-specific", "misattribution", "overconfident", "contradiction", "strawman",
];

/**
 * Pulls the JSON object out of a model reply. Models wrap it in prose or a code
 * fence often enough that a bare JSON.parse fails regularly.
 */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;

  try {
    return JSON.parse(candidate.trim());
  } catch {
    // Fall back to the outermost braces.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in reply");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function coerceFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  const out: Finding[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const kind = typeof e.kind === "string" ? (e.kind as FindingKind) : null;
    const note = typeof e.note === "string" ? e.note.trim() : "";
    if (!kind || !VALID_KINDS.includes(kind) || !note) continue;

    out.push({
      severity: e.severity === "reject" ? "reject" : "flag",
      kind,
      quote: typeof e.quote === "string" ? e.quote.trim() : "",
      note,
    });
  }
  return out;
}

function verdictFor(findings: Finding[]): ReviewVerdict {
  if (findings.some((f) => f.severity === "reject")) return "rejected";
  return findings.length > 0 ? "flagged" : "clean";
}

/**
 * Runs the reviewer model over one turn. `linkSummary` tells it what the network
 * already established so it does not speculate about links.
 */
async function reviewClaims(
  persona: string,
  speaker: string,
  topicTitle: string,
  statement: string,
  linkSummary: string,
  register: TopicRegister,
  settings: LLMSettings,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const endpoint = resolveEndpoint(settings);

  const userMessage =
    `Debate topic: ${topicTitle}\n\n` +
    `Speaker under review: ${speaker}\n\n` +
    `Debate register: ${register.toUpperCase()}` +
    (register === "frivolous"
      ? " — playful hyperbole and comic exaggeration are expected and must NOT be flagged; flag only a specific, credible-looking fabrication (a plausible statistic, a real-sounding study, a quotation) presented as genuine."
      : " — serious register, apply your standards as written; provocative advocacy is not a violation, invented checkable specifics are.") +
    `\n\nLink verification already performed over the network:\n${linkSummary}\n\n` +
    `--- STATEMENT UNDER REVIEW ---\n${statement}\n--- END STATEMENT ---\n\n` +
    `Review the statement per your rules and reply with the JSON object only.`;

  let raw = "";
  for await (const token of streamChat({
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    model: settings.model,
    messages: [
      { role: "system", content: persona },
      { role: "user", content: userMessage },
    ],
    maxTokens: 700,
    // Deterministic: a reviewer should not be creative about what it found.
    temperature: 0,
    headers: endpoint.headers,
    signal,
  })) {
    raw += token;
  }

  const parsed = extractJson(raw) as { findings?: unknown };
  return coerceFindings(parsed.findings);
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export interface ReviewContext {
  persona: string;
  speaker: string;
  topicTitle: string;
  /** How strictly the reviewer may judge. Frivolous registers downgrade the
   *  reviewer's veto so only a measured dead link can force a redo. */
  register?: TopicRegister;
  settings: LLMSettings;
  signal?: AbortSignal;
  /** Called as each stage begins, for UI status. */
  onStage?: (stage: "checking-links" | "reviewing") => void;
}

/**
 * Full fact-check for one turn: verify links, then review claims.
 * Never throws — a broken reviewer degrades to "no findings" with an error note,
 * because a failed check must not take the debate down with it.
 */
export async function reviewTurn(statement: string, ctx: ReviewContext): Promise<TurnReview> {
  const { factCheck } = ctx.settings;
  const register = resolveRegister(ctx.register);
  let links: LinkCheck[] = [];
  let error: string | undefined;

  if (factCheck.verifyLinks) {
    const urls = extractUrls(statement);
    if (urls.length > 0) {
      ctx.onStage?.("checking-links");
      links = await verifyLinks(urls, ctx.settings, ctx.signal);
    }
  }

  let findings: Finding[] = findingsFromLinks(links);

  if (factCheck.reviewClaims) {
    ctx.onStage?.("reviewing");
    try {
      findings.push(
        ...(await reviewClaims(
          ctx.persona,
          ctx.speaker,
          ctx.topicTitle,
          statement,
          describeLinksForModel(links),
          register,
          ctx.settings,
          ctx.signal,
        )),
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      error = `Claim review unavailable: ${(err as Error).message}`;
    }
  }

  // In a frivolous debate the reviewer's word alone must not force a whole
  // redo — comic exaggeration is the genre. The measured dead-link check is
  // untouched, so fabricated URLs still get thrown back in every register.
  if (register === "frivolous") {
    findings = findings.map((f) =>
      f.kind !== "dead-link" && f.severity === "reject"
        ? { ...f, severity: "flag" as FindingSeverity }
        : f,
    );
  }

  return { verdict: verdictFor(findings), findings, links, redos: 0, error };
}

function describeLinksForModel(links: LinkCheck[]): string {
  if (links.length === 0) return "(the statement contains no links)";
  return links
    .map((l) => `- ${l.url} → ${l.verdict}${l.httpStatus ? ` (HTTP ${l.httpStatus})` : ""}`)
    .join("\n");
}

// ── Redo instructions ─────────────────────────────────────────────────────────

/**
 * Builds the correction brief handed back to the speaker for a redo. Specific
 * instructions produce a specific fix; "try again, be accurate" produces the
 * same output with different wording.
 */
export function buildRedoInstruction(findings: Finding[]): string {
  const blocking = findings.filter((f) => f.severity === "reject");
  const notes = findings.filter((f) => f.severity === "flag");

  const lines: string[] = [
    "A fact-check of the turn you just delivered found problems that must be fixed.",
    "Deliver that turn again, keeping your argument and your position, but correcting the following.",
    "",
    "MUST FIX:",
  ];

  for (const f of blocking) {
    if (f.kind === "dead-link") {
      lines.push(
        `- The URL ${f.quote} does not exist. ${f.note} Remove it entirely and cite the source by ` +
        `name, publisher and year in prose instead. Do not substitute a different URL.`,
      );
    } else {
      lines.push(`- ${f.quote ? `"${f.quote}" — ` : ""}${f.note} Remove or correct this claim.`);
    }
  }

  if (notes.length > 0) {
    lines.push("", "ALSO IMPROVE:");
    for (const f of notes) {
      lines.push(`- ${f.quote ? `"${f.quote}" — ` : ""}${f.note}`);
    }
  }

  lines.push(
    "",
    "Rules for the rewrite:",
    "- Do not invent a replacement source, statistic, or link for anything you removed.",
    "- If you cannot support a point, drop it and make your case on the points you can support.",
    "- Do not mention this correction, the fact-check, or that you are revising. Deliver the turn as if for the first time.",
    "- Keep the same length and speaking style.",
  );

  return lines.join("\n");
}
