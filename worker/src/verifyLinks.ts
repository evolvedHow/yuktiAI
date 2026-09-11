/**
 * Link verification — the only part of fact-checking that produces ground truth.
 *
 * An LLM asked "is this URL real?" will answer confidently either way, because it
 * has no way to look. So the gateway actually fetches each URL and reports what
 * came back. Everything downstream treats this as fact and the model's opinion as
 * opinion.
 *
 * The browser cannot do this itself: cross-origin requests to arbitrary sites are
 * blocked by CORS. Running it here is what makes it possible at all.
 *
 * Because this endpoint fetches attacker-influenceable URLs (the text comes from
 * an LLM, which the topic and audience questions can steer), it is guarded
 * against being used to probe private networks — see isBlockedHost.
 */

export type LinkVerdict =
  /** Resolved with a success status — the page is there. */
  | "live"
  /** Server said it does not exist. This is the fabricated-URL signal. */
  | "missing"
  /** DNS failure, TLS failure, timeout — most often an invented hostname. */
  | "unreachable"
  /** Exists but wouldn't tell us more (401/403/429). NOT evidence of a fake. */
  | "restricted"
  /** The site is broken right now; says nothing about the URL being real. */
  | "server-error"
  /** We refused to fetch it (bad scheme, private address). */
  | "blocked";

export interface LinkCheck {
  url: string;
  verdict: LinkVerdict;
  httpStatus?: number;
  /** Set when following redirects landed somewhere else. */
  finalUrl?: string;
  reason?: string;
}

/** Keeps one turn's worth of checking bounded. */
const MAX_URLS = 12;
const PER_URL_TIMEOUT_MS = 6000;
const CONCURRENCY = 6;

const USER_AGENT = "YuktiAI-LinkCheck/1.0 (link verification for a debate transcript)";

const PRIVATE_HOSTNAME =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa|.*\.lan)$/i;

/**
 * Returns a reason string when a host must not be fetched, or null when it's fine.
 * Blocks loopback, private, link-local (cloud metadata at 169.254.169.254) and
 * carrier-grade NAT ranges, plus internal-only hostname suffixes.
 */
function isBlockedHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return "empty hostname";
  if (PRIVATE_HOSTNAME.test(host)) return "private hostname";

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return "private or loopback address";
    if (a === 172 && b >= 16 && b <= 31) return "private address";
    if (a === 192 && b === 168) return "private address";
    if (a === 169 && b === 254) return "link-local address";
    if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT address";
    if (a >= 224) return "multicast or reserved address";
  }

  if (host === "::1" || host === "::") return "loopback address";
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return "unique-local address";
  if (/^fe80:/i.test(host)) return "link-local address";

  return null;
}

function verdictForStatus(status: number): LinkVerdict {
  if (status >= 200 && status < 400) return "live";
  if (status === 404 || status === 410) return "missing";
  if (status === 401 || status === 403 || status === 429) return "restricted";
  if (status >= 500) return "server-error";
  // 400, 405 after a GET retry, 418, … — the host answered, so it exists.
  return "restricted";
}

async function checkOne(rawUrl: string): Promise<LinkCheck> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, verdict: "blocked", reason: "not a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: rawUrl, verdict: "blocked", reason: `unsupported scheme ${parsed.protocol}` };
  }

  const blocked = isBlockedHost(parsed.hostname);
  if (blocked) return { url: rawUrl, verdict: "blocked", reason: blocked };

  const headers = { "User-Agent": USER_AGENT, Accept: "*/*" };

  try {
    // HEAD is cheapest, but plenty of hosts reject it — retry those with a
    // single-byte ranged GET rather than calling a real page missing.
    let res = await fetch(parsed.toString(), {
      method: "HEAD",
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(PER_URL_TIMEOUT_MS),
    });

    if (res.status === 403 || res.status === 405 || res.status === 501 || res.status === 400) {
      const retry = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        headers: { ...headers, Range: "bytes=0-0" },
        signal: AbortSignal.timeout(PER_URL_TIMEOUT_MS),
      });
      // Never read the body — we only care that the server answered.
      await retry.body?.cancel().catch(() => {});
      res = retry;
    } else {
      await res.body?.cancel().catch(() => {});
    }

    const check: LinkCheck = {
      url: rawUrl,
      verdict: verdictForStatus(res.status),
      httpStatus: res.status,
    };
    if (res.url && res.url !== parsed.toString()) check.finalUrl = res.url;
    return check;
  } catch (err) {
    // DNS miss, TLS failure or timeout. For an invented hostname this is the
    // usual outcome — there is nothing there to answer.
    const message = err instanceof Error ? err.message : String(err);
    return {
      url: rawUrl,
      verdict: "unreachable",
      reason: /abort|timeout/i.test(message) ? "no response within 6s" : "host did not resolve or refused the connection",
    };
  }
}

/**
 * Checks a batch of URLs. Duplicates are collapsed, the list is capped, and the
 * result order matches the (deduplicated) input.
 */
export async function verifyLinks(urls: string[]): Promise<LinkCheck[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, MAX_URLS);
  const results: LinkCheck[] = [];

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(checkOne))));
  }

  return results;
}

export { MAX_URLS };
