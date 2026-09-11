/**
 * Fact-check summary attached to a message.
 *
 * Presents the two kinds of result distinctly, because they are not equally
 * trustworthy: link results are measured (the gateway fetched the URL), while
 * claim findings are a reviewer model's judgement and can be wrong in both
 * directions. The wording here is careful not to imply the model verified
 * anything it cannot verify.
 */
import { useState } from "react";
import {
  BAD_LINK_VERDICTS, Finding, FindingKind, LinkCheck, LinkVerdict, TurnReview,
} from "../types";

const KIND_LABEL: Record<FindingKind, string> = {
  "dead-link": "Dead link",
  "unverifiable-specific": "Unverifiable specific",
  "misattribution": "Possible misattribution",
  "overconfident": "Stated too confidently",
  "contradiction": "Contradiction",
  "strawman": "Misrepresents another speaker",
};

const LINK_LABEL: Record<LinkVerdict, string> = {
  live: "resolves",
  missing: "does not exist",
  unreachable: "did not resolve",
  restricted: "exists, blocked our check",
  "server-error": "site erroring",
  blocked: "not checked",
  unchecked: "not checked",
};

const LINK_TONE: Record<LinkVerdict, string> = {
  live: "text-green-700",
  missing: "text-red-700",
  unreachable: "text-red-700",
  restricted: "text-amber-700",
  "server-error": "text-amber-700",
  blocked: "text-muted",
  unchecked: "text-muted",
};

export function ReviewPanel({ review }: { review: TurnReview }) {
  const [open, setOpen] = useState(false);

  const dead = review.links.filter((l) => BAD_LINK_VERDICTS.includes(l.verdict));
  const live = review.links.filter((l) => l.verdict === "live");
  const checked = review.links.filter((l) => l.verdict !== "unchecked" && l.verdict !== "blocked");
  const corrected = review.corrected ?? [];
  const hasDetail =
    review.findings.length > 0 || review.links.length > 0 ||
    corrected.length > 0 || Boolean(review.error);

  // Nothing found, nothing checked, nothing to say.
  if (!hasDetail && review.verdict === "clean") return null;

  const summary = buildSummary(review, live.length, dead.length, checked.length);

  return (
    <div className="mt-2.5 border-t border-black/[0.06] pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-muted hover:text-ink transition-colors"
        aria-expanded={open}
      >
        <VerdictDot verdict={review.verdict} />
        <span className={review.verdict === "rejected" ? "text-amber-800 font-medium" : ""}>
          {summary}
        </span>
        {hasDetail && <span className="text-[9px] opacity-60">{open ? "▲" : "▼"}</span>}
      </button>

      {open && hasDetail && (
        <div className="mt-2 space-y-2.5 text-[11px] leading-relaxed">
          {corrected.length > 0 && (
            <div>
              <p className="font-semibold text-ink/70 mb-1">
                Removed before this turn was accepted
              </p>
              <ul className="space-y-1.5">
                {corrected.map((f, i) => <FindingRow key={`c${i}`} finding={f} />)}
              </ul>
            </div>
          )}

          {review.links.length > 0 && (
            <div>
              <p className="font-semibold text-ink/70 mb-1">
                Links checked over the network
              </p>
              <ul className="space-y-1">
                {review.links.map((link) => <LinkRow key={link.url} link={link} />)}
              </ul>
            </div>
          )}

          {review.findings.length > 0 && (
            <div>
              <p className="font-semibold text-ink/70 mb-1">
                Reviewer notes
                <span className="font-normal text-muted"> — a model's judgement, not verified fact</span>
              </p>
              <ul className="space-y-1.5">
                {review.findings
                  .filter((f) => f.kind !== "dead-link")
                  .map((f, i) => <FindingRow key={i} finding={f} />)}
              </ul>
            </div>
          )}

          {review.error && <p className="text-muted italic">{review.error}</p>}
        </div>
      )}
    </div>
  );
}

function buildSummary(review: TurnReview, live: number, dead: number, checked: number): string {
  const parts: string[] = [];

  if (review.redos > 0) {
    const removed = review.corrected?.length ?? 0;
    const deadRemoved = review.corrected?.filter((f) => f.kind === "dead-link").length ?? 0;
    parts.push(
      deadRemoved > 0
        ? `Revised — ${deadRemoved} fabricated link${deadRemoved === 1 ? "" : "s"} removed`
        : removed > 0
          ? `Revised — ${removed} claim${removed === 1 ? "" : "s"} removed`
          : "Revised after fact-check",
    );
  }

  if (checked > 0) {
    if (dead > 0) parts.push(`${dead} dead link${dead === 1 ? "" : "s"}`);
    if (live > 0) parts.push(`${live} link${live === 1 ? "" : "s"} verified`);
  } else if (review.links.length > 0) {
    parts.push(`${review.links.length} link${review.links.length === 1 ? "" : "s"} unchecked`);
  }

  const claims = review.findings.filter((f) => f.kind !== "dead-link").length;
  if (claims > 0) parts.push(`${claims} claim${claims === 1 ? "" : "s"} flagged`);

  if (parts.length === 0) return "Fact-check passed";
  return parts.join(" · ");
}

function VerdictDot({ verdict }: { verdict: TurnReview["verdict"] }) {
  const cls = {
    clean: "bg-green-500",
    flagged: "bg-amber-400",
    rejected: "bg-red-500",
  }[verdict];
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

function LinkRow({ link }: { link: LinkCheck }) {
  return (
    <li className="flex items-start gap-1.5">
      <span className={`shrink-0 ${LINK_TONE[link.verdict]}`}>
        {BAD_LINK_VERDICTS.includes(link.verdict) ? "✕" : link.verdict === "live" ? "✓" : "•"}
      </span>
      <span className="min-w-0">
        <span className="break-all text-ink/70">{link.url}</span>
        <span className={`ml-1.5 ${LINK_TONE[link.verdict]}`}>
          — {LINK_LABEL[link.verdict]}
          {link.httpStatus ? ` (${link.httpStatus})` : ""}
        </span>
        {link.verdict === "unchecked" && link.reason && (
          <span className="ml-1 text-muted italic">({link.reason})</span>
        )}
      </span>
    </li>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="flex items-start gap-1.5">
      <span
        className={`shrink-0 text-[9px] uppercase tracking-wide font-semibold px-1 py-0.5 rounded ${
          finding.severity === "reject"
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-800"
        }`}
      >
        {finding.severity === "reject" ? "reject" : "flag"}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-ink/80">{KIND_LABEL[finding.kind]}</span>
        {finding.quote && (
          <span className="text-muted italic"> — “{truncate(finding.quote, 90)}”</span>
        )}
        <span className="block text-ink/60">{finding.note}</span>
      </span>
    </li>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
