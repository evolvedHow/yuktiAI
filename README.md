# YuktiAI — Debate Arena

A client-side AI-powered debate arena. Three AI agents (Moderator, Advocate,
Critic) debate civic and policy topics with token streaming, a typewriter
reveal, audience Q&A injection, and one-click Markdown/PDF export.

**The static site deploys to GitHub Pages. An optional Cloudflare Worker holds
the API keys, so nothing secret ships in the bundle.**

---

## Architecture

```
yuktiAI/
├── public/
│   ├── agents/               ← Persona .md files + register guidance (hot-swappable)
│   ├── styles/               ← Debate styles (English, Hinglish, Tanglish)
│   └── topics/               ← Topic .yml files + index.json
├── src/
│   ├── debate/
│   │   ├── llmClient.ts      ← Streaming fetch wrapper (OpenAI-compatible)
│   │   ├── gateway.ts        ← Direct-vs-gateway endpoint resolution
│   │   ├── typewriter.ts     ← Paced reveal queue
│   │   ├── styles.ts         ← Style loader
│   │   └── orchestrator.ts   ← Client-side debate loop + persona loader
│   ├── hooks/useDebate.ts    ← React hook — all state + orchestration glue
│   ├── components/
│   │   ├── Markdown.tsx      ← Hardened markdown renderer for agent output
│   │   └── …                 ← Sidebar, MessageCard, Transcript, Settings
│   └── utils/                ← Markdown + PDF export
├── worker/                   ← Cloudflare Worker key gateway (see worker/README.md)
├── backend/                  ← Alternative Python/FastAPI proxy
└── .github/workflows/deploy.yml   ← Auto-deploy to GitHub Pages
```

### Where the API key lives

Two modes, switchable at runtime in **Settings**:

| Mode | How it works | Use when |
|---|---|---|
| **Gateway** *(recommended)* | The browser calls the [Cloudflare Worker](worker/README.md), which injects a key it holds as a Worker secret. | Anything public or shared. |
| **Direct** | The browser calls the provider itself with a key from `localStorage`. | Local development, personal use. |

In gateway mode users pick a **provider profile** (Groq, OpenAI, Anthropic, …).
Profiles the gateway has a key for are marked *key on gateway*; for the rest —
or when a user prefers their own account — Settings offers **My own key**, which
is forwarded through the gateway and never stored server-side.

Adding another key later needs no frontend change: set one more secret on the
Worker (`wrangler secret put KEY_<PROVIDER>`) and it appears in the picker.

**One Worker serves every provider — there is no per-provider Worker.** The
single Worker is selected by the `X-Yukti-Provider` header (or a `provider`
field in the request body), and each provider's key is a separate secret named
after the profile (`KEY_GROQ`, `KEY_OPENAI`, `KEY_ANTHROPIC`, …). New providers
are added by setting a secret plus an optional `EXTRA_PROVIDERS` JSON variable —
no code change, no redeploy of the app, and no second Worker.

**The Worker itself is not hardcoded anywhere in the app.** The frontend only
ever reads the gateway URL from `VITE_BACKEND_URL` at build time or from
**Settings → Key Gateway** at runtime; point that at any deployment you control
(your own Worker, a fork, a regional endpoint). Blank it and the app falls back
to direct-to-provider mode. Similarly, per-profile provider base URLs can be
overridden per deployment (`BASE_URL_<PROVIDER>`), so nothing in the bundle ties
you to a specific host.

---

## Quickstart (local)

```bash
git clone https://github.com/YOUR_USERNAME/yuktiAI.git
cd yuktiAI
npm install
npm run dev          # → http://localhost:5173
```

Then open **Settings** (⚙️ icon in the sidebar) and either paste an API key
(direct mode) or point **Key Gateway** at a running Worker. Select a topic from
the sidebar and the debate begins.

### Running the key gateway locally

```bash
cd worker && npm install && cp .dev.vars.example .dev.vars
```

Add at least one key to `.dev.vars`, then:

```bash
npx wrangler dev
```

Set **Settings → Key Gateway** to `http://localhost:8787`. Full setup and deploy
instructions are in [worker/README.md](worker/README.md).

---

## Deploy to GitHub Pages

### One-time setup

1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. If deploying to a *project page* (e.g. `username.github.io/yuktiAI`), add a
   repository variable: **Settings → Variables → Actions → New** →
   `VITE_BASE_PATH` = `/yuktiAI`
4. Deploy the gateway (`cd worker && npx wrangler deploy`) and add its URL as the
   repository variable `VITE_BACKEND_URL`, so visitors get working keys with no
   setup. Skip this only if every visitor will bring their own key.
5. Push to `main` — the workflow builds and deploys automatically.

> Setting `VITE_LLM_API_KEY` instead embeds that key in the published
> JavaScript, where anyone can read it. It's fine for a private page and a bad
> idea for a public one.

### User/org page (`username.github.io`)

No `VITE_BASE_PATH` needed — leave it blank or remove it.

---

## Topics

Two ways to start a debate:

**From the list** — topics live in `public/topics/*.yml`, grouped into sets that
`public/topics/index.json` registers for the sidebar dropdown. Each entry needs:

```yaml
topics:
  - id: unique_slug
    title: Display Name
    description: One-paragraph framing shown in the sidebar and injected into agent prompts.
    register: serious   # or: frivolous
```

**Register** — how the topic is fought. `serious` (the default when omitted) has
real stakes and expects sincere, evidence-facing argument. `frivolous` is a
playful register: comic exaggeration, theatrical bias and low-stakes trash-talk
are the genre. The register also calibrates the fact-checker (see
[Accuracy](#accuracy-fabricated-links-and-claims)), and is shown as a badge on
each topic and in the debate header. A topic without a `register:` line is
treated as `serious`.

**Typed in** — the **📝 Custom Topic** button at the top of the sidebar takes any
title and optional framing. Entered topics are saved to this browser under
**Your Topics** (the twelve most recent) so they can be re-run, and removed with
the ✕ on hover.

---

## Pacing and reveal

Both live in **Settings**, and both apply to the current session immediately.

**Pause between turns** — how long the debate waits after one agent finishes
before the next LLM call is made. The transcript shows a countdown bar you can
pause or click through. Turning off **Advance automatically** makes every turn
wait for a click instead, with no timer at all.

**Typewriter effect** — responses are revealed at a steady rate rather than in
whatever bursts the model streams, so they can be read as they arrive. Choose
word or character granularity and a speed; **⏩ Skip typing** in the transcript
paints the rest of the current turn at once. The next agent is not called until
the current one has finished appearing, so the debate never runs ahead of the
reader.

---

## When the LLM won't talk

A failed call (no key, wrong key, dead gateway, rate limit) shows up as an error
card instead of a speech — and the debate **stops rather than replaying that
card for every remaining turn**.

- A call that dies on the wire is retried up to twice (status shows
  *"Connection failed — retrying…"*), so one blip doesn't kill a debate.
- If it keeps failing, the debate ends after that turn; no more LLM calls are
  made and no error cards are churned out.
- Starting is guarded too: with **no key at all** the debate won't begin, and if
  a gateway URL is configured it is pinged first, so an unreachable gateway is
  reported up front instead of as fourteen identical errors.

---

## Accuracy: fabricated links and claims

LLMs invent citations. A model asked for a source will produce a URL that looks
exactly right — correct domain, plausible path — and 404s. Three layers address
this, and they are **not** equally reliable. The distinction matters, so the UI
keeps them visually separate too.

### 1. Sourcing rules — prevention (free)

[`public/agents/evidence-policy.md`](public/agents/evidence-policy.md) is
appended to every speaker's system prompt. It forbids writing a URL the speaker
isn't sure of, forbids assembling one from a pattern, and tells them to cite by
publication, author and year instead — which is a complete citation the audience
can actually follow. It extends the same rule to invented statistics, quotations,
study titles and programme names, and requires hedged language for anything
recalled rather than known.

This reduces fabrication. It cannot eliminate it — the model still has no way to
check.

### 2. Link verification — measurement (reliable)

Every URL a speaker cites is **actually fetched** through the gateway, and the
HTTP result is recorded. This is the layer that genuinely catches a made-up link,
and no model is involved in it:

- `missing` (404) or `unreachable` (no such host) → treated as fabricated. The
  turn is rejected and sent back for a redo.
- `restricted` (403/429) → *not* treated as fabricated. Real sites block edge
  fetchers, and calling those fake would be worse than missing a few.

A link that survives to the final text but is still dead renders **struck
through and unclickable**, so nobody is sent to a 404.

> This requires a gateway. A browser cannot fetch arbitrary sites to check them —
> CORS forbids it. Without one, links show as *unchecked* rather than pretending
> to be verified.

### 3. Claim review — judgement (fallible)

A reviewer model ([`factchecker.md`](public/agents/factchecker.md)) reads each
turn and flags precise figures stated as settled fact, named studies and
quotations that may not exist, inferences dressed as findings, contradictions,
and misrepresentations of another speaker. It is explicitly told **not** to opine
on links, because the network already answered that.

This catches real problems. It also misses things and occasionally objects to
something true — it is a smoke alarm, not proof. The transcript labels these
"a model's judgement, not verified fact" for exactly that reason. Its own
`verdict` field is ignored; severity is recomputed from the findings it returns.

**Registers calibrate the smoke alarm.** How hard the reviewer throws a turn back
depends on the debate's register ([see Topics](#topics)). In a `frivolous`
debate, comic exaggeration and obviously-playful invention are the genre and are
never flagged, and the reviewer's own `reject` findings are downgraded to
`flag` — so a single joke cannot send a playful turn back for a rewrite. The one
thing that stays a hard `reject` in both registers is a link measured as dead:
fabricated URLs get a rewrite everywhere, even in a dosa vs. idli debate.

### The redo loop

When a turn is rejected, the speaker is shown its own rejected text plus a
specific correction — *"the URL X does not exist; remove it and cite the source
by name; do not substitute a different URL"* — and delivers the turn again. The
rejected attempt **never enters the debate history**, so later speakers never
build on a retracted claim.

The revised turn replaces the original in the transcript, and the card records
what was removed. Default is one redo per turn; if a turn still fails after the
last attempt it stands, with the findings shown.

### Cost

Claim review adds one LLM call per turn, roughly doubling usage. Link
verification costs nothing beyond the fetches. All three layers are individually
toggleable under **Settings → Accuracy**, along with the redo limit.

---

## Markdown in responses

Agent output is rendered as full CommonMark + GitHub-flavoured markdown, so
agents can cite and illustrate their arguments:

| | |
|---|---|
| **Links** | Open in a new tab, `rel="noopener noreferrer nofollow"`. |
| **Attachments** | A link ending in `.pdf`, `.csv`, `.xlsx`, `.zip`, … renders as a chip with a paperclip and a file-type badge. |
| **Images** | Rendered inline, lazily, with no referrer sent. A URL that fails to load degrades to a link rather than a broken icon. |
| **Tables** | Scroll horizontally inside the card instead of stretching it. |
| **Also** | Headings, nested lists, task lists, blockquotes, fenced code, strikethrough, footnotes, autolinks. |

Single newlines stay line breaks (via `remark-breaks`) — agents write prose that
assumes this, and strict markdown would collapse it.

The PDF export renders through the same component, so an exported transcript
matches the screen. Link destinations are printed after each link, since paper
isn't clickable.

### Treating agent output as untrusted

LLM output can be steered by the topic text and by audience questions, so it is
rendered defensively:

- **Raw HTML is never rendered.** `rehype-raw` is deliberately not installed, so
  `<script>` or an `onerror` attribute appears as literal text.
- **URLs are filtered** to `http`, `https`, `mailto`, `tel`, relative paths, and
  inline `data:image/*`. A `javascript:` or `data:text/html` link keeps its label
  and loses its href.

Both rules live in `safeUrl()` in
[Markdown.tsx](src/components/Markdown.tsx) — that function is the only place
that decides what a URL may be, and `urlTransform` is set to a pass-through so
nothing filters ahead of it. If you add `rehype-raw` to support inline HTML,
pair it with a sanitizer.

> Full markdown costs about 50 kB gzipped (react-markdown + remark-gfm). If that
> matters more than link and table support, the renderer is a single file to
> swap out.

---

## Swapping Agent Personas

Edit `public/agents/moderator.md`, `advocate.md`, or `critic.md`.

Each file is a plain Markdown document injected verbatim as the agent's **system
prompt**. The orchestrator appends the topic title and description automatically,
plus the active topic's register guidance (`register-serious.md` /
`register-frivolous.md`) and, when enabled, the evidence rules. Changes take
effect immediately on the next debate start (no rebuild needed).

Guidelines:
- Keep each persona under ~600 words to stay within model context limits.
- Define: **Role**, **Tone**, **Argumentation style**, and **Hard rules**.
- The speakers are written as factional, opinionated humans, not neutral essay
  writers: the Advocate advances its side with conviction (and is allowed to
  argue selectively), the Critic is sharp and emotionally engaged — but both are
  bound by the sourcing rules below, because a fabricated claim is a
  disqualifying failure, not a rhetorical flourish.
- The file name (`moderator`, `advocate`, `critic`) is the only coupling — the
  display names ("Arya", "Priya", "Kiran") are set in `src/components/MessageCard.tsx`.

`public/agents/register-serious.md` and `public/agents/register-frivolous.md`
carry the per-register licence: which style of hyperbole is welcome and which
line still must not be crossed. `evidence-policy.md` and `factchecker.md`
calibrate the accuracy layers per register (see
[Accuracy](#accuracy-fabricated-links-and-claims)).

---

## Supported LLM Providers

| Provider | Base URL | Notes |
|---|---|---|
| **Groq** (recommended) | `https://api.groq.com/openai/v1` | Free tier, very fast |
| **OpenAI** | `https://api.openai.com/v1` | GPT-4o, GPT-4o-mini |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Routes to 100+ models |
| **Together AI** | `https://api.together.xyz/v1` | Open models |
| **Local Ollama** | `http://localhost:11434/v1` | Requires `OLLAMA_ORIGINS=*` |
| **Any OpenAI-compatible** | custom URL | Just paste the base URL |

In gateway mode the same providers are available as pre-configured profiles,
plus **Anthropic** and **Cerebras**. See
[worker/src/providers.ts](worker/src/providers.ts).

---

## Keyboard / UX Notes

- **Enter** in the question field sends the question (Shift+Enter for newline).
- **Esc** closes the Custom Topic dialog; clicking the backdrop closes either dialog.
- The **Export PDF** button appears after the debate concludes.
- Clicking a new topic mid-debate shows a confirmation prompt before stopping.
- **Request Conclusion** flags the Moderator to wrap up on its next scheduled turn —
  it will never interrupt a speaker mid-stream.

---

## Development

```bash
npm run dev        # dev server with HMR
npm run build      # production build → dist/
npm run preview    # preview production build locally
npm run lint       # TypeScript type-check
```

The gateway is a separate package:

```bash
cd worker && npm install && npx wrangler dev
```
