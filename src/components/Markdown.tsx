/**
 * Markdown renderer for agent responses.
 *
 * Agents routinely cite sources, link to reports, and occasionally embed an
 * image, so their output is rendered as full CommonMark + GitHub-flavoured
 * markdown: links, images, tables, code, blockquotes, task lists, footnotes.
 *
 * Safety: the content comes from an LLM, which can be steered by the topic text
 * and by audience questions, so it is treated as untrusted.
 *   - Raw HTML in the markdown is NOT rendered (no rehype-raw). It appears as
 *     literal text, so a response cannot inject markup or script.
 *   - URLs are filtered by safeUrl() below — only http, https, mailto, tel and
 *     inline data: images survive. javascript: links become inert text.
 *   - Links open in a new tab with rel="noopener noreferrer nofollow", and
 *     images are loaded with no referrer.
 *
 * remark-breaks is included because agents write prose with single newlines and
 * expect them to be line breaks; strict markdown would collapse them.
 */
import { createContext, useContext, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { BAD_LINK_VERDICTS, type LinkCheck } from "../types";

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

/**
 * Verified-dead URLs for the message being rendered. Populated from the turn's
 * fact-check so a link that 404s is struck through in place rather than
 * inviting the reader to click into nothing.
 */
const DeadLinkContext = createContext<Set<string>>(new Set());

function useIsDead(url: string): boolean {
  return useContext(DeadLinkContext).has(url);
}

/** Links that point at a file get a download-style chip rather than a bare link. */
const ATTACHMENT_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|csv|tsv|json|xml|zip|tar|gz|7z|rtf|epub|mp3|wav|mp4|mov|webm)(?:[?#]|$)/i;

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

/**
 * Returns the URL if it is safe to put in an href/src, otherwise "".
 * Relative URLs are kept — they resolve against our own origin.
 */
function safeUrl(url: string, allowInlineImage = false): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  // A colon before any slash/?/# means it carries an explicit scheme.
  const schemeEnd = trimmed.indexOf(":");
  const firstPathish = trimmed.search(/[/?#]/);
  const hasScheme = schemeEnd > -1 && (firstPathish === -1 || schemeEnd < firstPathish);
  if (!hasScheme) return trimmed;

  const protocol = trimmed.slice(0, schemeEnd + 1).toLowerCase();
  if (SAFE_PROTOCOLS.includes(protocol)) return trimmed;
  if (allowInlineImage && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

/** Last path segment, for labelling attachment chips. */
function fileNameFrom(url: string): string {
  try {
    const path = new URL(url, "https://placeholder.invalid").pathname;
    return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? url);
  } catch {
    return url;
  }
}

// ── Images ────────────────────────────────────────────────────────────────────

/** Renders an image, degrading to a plain link if the URL will not load. */
function MarkdownImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  const href = safeUrl(src, true);

  if (!href) return <span className="text-muted italic">{alt || "image"}</span>;

  if (failed) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-1.5 text-xs text-muted border border-border rounded-lg px-2 py-1 my-1 hover:bg-white transition-colors"
        title="This image could not be loaded"
      >
        <ImageIcon />
        <span className="underline decoration-dotted">{alt || fileNameFrom(href)}</span>
      </a>
    );
  }

  return (
    <img
      src={href}
      alt={alt}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="max-w-full h-auto rounded-lg border border-border my-2 block"
    />
  );
}

// ── Links ─────────────────────────────────────────────────────────────────────

/**
 * A link, rendered three ways: struck through with a warning when the fact-check
 * proved it dead, as a paperclip chip when it points at a file, otherwise plain.
 */
function SmartLink({
  url, title, children,
}: {
  url: string;
  title?: string;
  children: React.ReactNode;
}) {
  const dead = useIsDead(url);

  if (dead) {
    // Deliberately not a link — sending the reader to a known 404 is worse than
    // showing them that the speaker made the address up.
    return (
      <span
        className="inline-flex items-center gap-1 align-baseline text-ink/45 line-through decoration-red-400"
        title={`${url} — this address does not resolve; flagged by the fact-check`}
      >
        <WarningIcon />
        {children}
      </span>
    );
  }

  if (ATTACHMENT_EXT.test(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={title ?? url}
        className="inline-flex items-center gap-1.5 align-middle text-xs font-medium border border-border rounded-lg px-2 py-1 mx-0.5 my-0.5 bg-white/70 hover:bg-white text-ink transition-colors"
      >
        <PaperclipIcon />
        <span className="truncate max-w-[18rem]">{children}</span>
        <span className="text-[9px] uppercase tracking-wide text-muted">
          {(url.match(ATTACHMENT_EXT)?.[1] ?? "file").toLowerCase()}
        </span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={title ?? url}
      className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600 break-words"
    >
      {children}
    </a>
  );
}

// ── Component map ─────────────────────────────────────────────────────────────

const COMPONENTS: Components = {
  a({ href, children, title }) {
    const raw = (href ?? "").trim();

    // Footnote/anchor links stay in the page rather than opening a tab.
    if (raw.startsWith("#")) {
      return <a href={raw} className="text-blue-700 underline underline-offset-2">{children}</a>;
    }

    const url = safeUrl(raw);
    // Unsafe scheme — show the text, drop the link.
    if (!url) return <span>{children}</span>;

    return <SmartLink url={url} title={title}>{children}</SmartLink>;
  },

  img({ src, alt, title }) {
    return <MarkdownImage src={typeof src === "string" ? src : ""} alt={alt ?? ""} title={title} />;
  },

  // Wide tables scroll inside the card instead of stretching it.
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2 rounded-lg border border-border bg-white/60">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    );
  },
  thead: ({ children }) => <thead className="bg-black/[0.03]">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left font-semibold px-2.5 py-1.5 border-b border-border align-top">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 border-b border-border/60 align-top">{children}</td>
  ),

  h1: ({ children }) => <p className="font-semibold text-[15px] mt-3 mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-sm mt-3 mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
  h4: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
  h5: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
  h6: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,

  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 my-2 text-ink/75 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,

  // Inline code is styled here; the `pre code` reset in index.css strips this
  // again inside fenced blocks, which is the only reliable way to tell the two
  // apart with react-markdown's component API.
  code: ({ children, className }) => (
    <code className={`rounded bg-black/[0.06] px-1 py-0.5 text-[0.85em] font-mono ${className ?? ""}`}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-border bg-white/70 p-3 my-2 text-xs font-mono leading-relaxed">
      {children}
    </pre>
  ),

  // GFM task lists
  input: ({ checked, type }) =>
    type === "checkbox"
      ? <input type="checkbox" checked={Boolean(checked)} readOnly className="mr-1.5 align-middle" />
      : null,
};

// ── Public component ──────────────────────────────────────────────────────────

export function Markdown({ content, links }: { content: string; links?: LinkCheck[] }) {
  const dead = useMemo(
    () => new Set((links ?? []).filter((l) => BAD_LINK_VERDICTS.includes(l.verdict)).map((l) => l.url)),
    [links],
  );

  const tree = (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={COMPONENTS}
      // Pass URLs through untouched so safeUrl() above is the single place that
      // decides what is allowed. react-markdown's built-in filter would
      // otherwise run first and strip tel: and inline data: images, which are
      // both wanted here.
      urlTransform={(url) => url}
    >
      {content}
    </ReactMarkdown>
  );

  if (dead.size === 0) return tree;
  return <DeadLinkContext.Provider value={dead}>{tree}</DeadLinkContext.Provider>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PaperclipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="shrink-0 text-red-500">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" className="shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
