# YuktiAI — Debate Arena

A client-side AI-powered debate arena. Three AI agents (Moderator, Advocate,
Critic) debate civic and policy topics with token streaming, a typewriter
reveal, audience Q&A injection, and one-click Markdown/PDF export.

**The static site deploys to GitHub Pages. All LLM calls are proxied through a
single shared gateway (the worker-env Cloudflare Worker), which holds the
provider keys server-side — nothing secret ships in the bundle.**

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
│   │   ├── gateway.ts        ← Gateway endpoint resolution + providers fetch
│   │   ├── typewriter.ts     ← Paced reveal queue
│   │   ├── styles.ts         ← Style loader
│   │   └── orchestrator.ts   ← Client-side debate loop + persona loader
│   ├── hooks/useDebate.ts    ← React hook — all state + orchestration glue
│   ├── components/
│   │   ├── Markdown.tsx      ← Hardened markdown renderer for agent output
│   │   └── …                 ← Sidebar, MessageCard, Transcript, Settings
│   └── utils/                ← Markdown + PDF export
└── .github/workflows/deploy.yml   ← Auto-deploy to GitHub Pages
```

The gateway itself lives in the separate
[`codebox/worker-env`](https://github.com/evolvedHow/worker-env) repo, deployed
to `https://worker-env-vault.vish-ganapathy.workers.dev`.

### Where the API keys live

Server-side, in the gateway. The browser never holds a key; it only picks a
**provider** from the gateway's public `GET /providers` catalogue and sends the
chosen provider id on each request (`X-Yukti-Provider`) plus, when the gateway is
deployed with one, a **passcode** (`X-Yukti-Passcode`). The gateway injects the
matching `KEY_<PROVIDER>` from its CSV vault.

Profiles the gateway has a key for are selectable in **Settings → Provider**.
Adding another key later needs no frontend change: add `KEY_<PROVIDER>` to the
vault context `yuktiai` in worker-env and it appears in the picker on the next
page load.

### Gateway access

Because the gateway now spends real credits on the site's behalf, its chat and
link-verification routes can be gated behind a passphrase. If the deploy has an
`ACCESS_PASSCODE` secret set in its `yuktiai` vault context, **Settings** shows
the **Gateway passcode** field and starting a debate is blocked until it
matches. The `/providers` catalogue stays public, so the picker renders before
any passcode is asked for.

There is no client-side vault, password, or stored key: the passcode lives only
in that browser's `localStorage`, and the keys never leave the gateway.

**Starting a debate is blocked until the gateway is configured.** If
`VITE_BACKEND_URL` was baked in at build time, that means "enter the passcode".
With no gateway URL at all, starting shows the precise fix required and the
header keeps a persistent warning banner with a shortcut to **Settings**. The
topic-review agent and claim-reviewer are gated the same way — no LLM call ever
happens before the gateway answers.

**One gateway serves every provider.** The provider is selected by the
`X-Yukti-Provider` header (or a `provider` field in the request body), and each
provider's key is a separate entry in the worker-env vault (`KEY_GROQ`,
`KEY_OPENAI`, `KEY_ANTHROPIC`, …). New providers are added by adding a vault key
plus an optional `EXTRA_PROVIDERS` JSON variable — no code change, no redeploy of
the app.

**The gateway is not hardcoded anywhere in the app.** The frontend only ever
reads the gateway URL from `VITE_BACKEND_URL` at build time or from
**Settings → Provider Gateway** at runtime; point that at any deployment you
control (worker-env, a fork, a regional endpoint). Nothing in the bundle ties
you to a specific host.

---

## Quickstart (local)

```bash
git clone https://github.com/YOUR_USERNAME/yuktiAI.git
cd yuktiAI
npm install
npm run dev          # → http://localhost:5173
```

Then open **Settings** (⚙️ icon in the sidebar), pick a provider the gateway has
a key for (the deploy above forwards them), and enter the gateways passcode if
one is required. Select a topic from the sidebar and the debate begins.

### Pointing at a gateway locally

Set `VITE_BACKEND_URL` in `.env.local` before `npm run dev`:

```env
VITE_BACKEND_URL=https://worker-env-vault.vish-ganapathy.workers.dev
```

No local Worker needed — the gateway is deployed from the separate
[`worker-env`](https://github.com/evolvedHow/worker-env) repo.

---

## Deploy to GitHub Pages

### One-time setup

1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. If deploying to a *project page* (e.g. `username.github.io/yuktiAI`), add a
   repository variable: **Settings → Variables → Actions → New** →
   `VITE_BASE_PATH` = `/yuktiAI`
4. Deploy the gateway from the `worker-env` repo (`npm run deploy`) and add its
   URL as the repository variable `VITE_BACKEND_URL`, so visitors get working
   keys with no setup. Also set `VITE_GATEWAY_PROVIDER` to the default provider
   (e.g. `anthropic`). Optionally set `VITE_LLM_MODEL`.
5. Push to `main` — the workflow builds and deploys automatically.

> Nothing secret is ever baked into the bundle — provider keys stay on the
> gateway. If you want a passphrase gate on the gateway's paid routes, set
> `ACCESS_PASSCODE` in the gateway's `yuktiai` vault context and redeploy it.

### User/org page (`username.github.io`)

No `VITE_BASE_PATH` needed — leave it blank or remove it.

---

## Topics

Three ways to start a debate:

**From the list** — topics live in `public/topics/*.yml`, grouped into sets that
`public/topics/index.json` registers for the sidebar dropdown. Each entry needs:

```yaml
topics:
  - id: unique_slug
    title: Display Name
    description: One-paragraph framing shown in the sidebar and injected into agent prompts.
    keywords: [elections, ai, regulation]   # optional — powers sidebar search
```

**Tone** — a single **global** setting, picked live from the **Tone** control in the
sidebar (**Serious / Jovial / Informal**) and applied from the next turn onward. It is
never assigned to an individual topic — legacy `tone:`/`register:` keys in the `.yml`
files are ignored. `serious` (the default) has real stakes and expects sincere,
evidence-facing argument. `jovial` (formerly called *frivolous*) is a playful register:
comic exaggeration, theatrical bias and low-stakes trash-talk are the genre. `informal`
is a relaxed, conversational register without the comedy licence. Tone calibrates the
fact-checker (see [Accuracy](#accuracy-fabricated-links-and-claims)) and is shown as a
badge in the debate header. The choice persists per-browser with the rest of your
settings.

**Typed in / edited** — the **📝 Add Topic** button opens the topic editor:
title, description and optional search keywords. Every topic — including ones that come
from the `.yml` files — can be liked/disliked and shows small usage and vote counters
under its title; every topic can be edited (✎), and managed topics removed (✕), from the
sidebar.

**AI-reviewed** — new topics can be sent through the **topic-review agent**
([`public/agents/topic-reviewer.md`](public/agents/topic-reviewer.md)), which sharpens
the title and adds search keywords. The refined version is shown back and must be
approved before saving — the agent edits the user's words, never silently replaces their
intent. Auto-review on save (toggle in Settings → New Topics, default on) is skipped
automatically until the gateway responds; the ✨ Review &amp; refine button in the editor
runs it on demand. Reviewed topics can be searched by their keywords in the sidebar
search box.

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

A failed call (no gateway configured, wrong passcode, dead gateway, rate limit)
shows up as an error card instead of a speech — and the debate **stops rather
than replaying that card for every remaining turn**.

- A call that dies on the wire is retried up to twice (status shows
  *"Connection failed — retrying…"*), so one blip doesn't kill a debate.
- If it keeps failing, the debate ends after that turn; no more LLM calls are
  made and no error cards are churned out.
- Starting is guarded too: with **no working gateway** the debate won't begin,
  and if a gateway URL is configured it is pinged first, so an unreachable
  gateway is reported up front instead of as fourteen identical errors.

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

**Tone calibrates the smoke alarm.** How hard the reviewer throws a turn back
depends on the topic's tone ([see Topics](#topics)). In a `jovial` debate, comic
exaggeration and obviously-playful invention are the genre and are never
flagged, and the reviewer's own `reject` findings are downgraded to `flag` — so
a single joke cannot send a playful turn back for a rewrite. `informal` debates
relax the same way without the comedy licence. The one thing that stays a hard
`reject` in every tone is a link measured as dead: fabricated URLs get a rewrite
everywhere, even in a dosa vs. idli debate.

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
plus the active topic's tone guidance (`register-serious.md` /
`register-jovial.md` / `register-informal.md`) and, when enabled, the evidence
rules. Changes take effect immediately on the next debate start (no rebuild
needed).

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

`public/agents/register-serious.md`, `register-jovial.md` and
`register-informal.md` carry the per-tone licence: which style of hyperbole is
welcome and which line still must not be crossed. `evidence-policy.md` and
`factchecker.md` calibrate the accuracy layers per tone (see
[Accuracy](#accuracy-fabricated-links-and-claims)), and
`public/agents/topic-reviewer.md` powers the AI topic review (see
[Topics](#topics)).

---

## Supported LLM Providers

The gateway ships pre-configured profiles for **Groq**, **OpenAI**, **Anthropic**,
**OpenRouter**, **Together AI**, **Cerebras** and **Google** — see
[`worker/providers.py`](https://github.com/evolvedHow/worker-env/blob/master/worker/providers.py)
in the worker-env repo. Only providers the gateway holds a key for
(`KEY_<PROVIDER>` in the `yuktiai` vault context) are selectable in
**Settings → Provider**.

---

## Keyboard / UX Notes

- **Enter** in the question field sends the question (Shift+Enter for newline).
- **Esc** closes the Settings and topic editor; clicking the backdrop closes either dialog.
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

The gateway is a separate package in the `worker-env` repo:

```bash
cd ~/codebox/worker-env && uv run ruff check worker tests && uv run pytest
npm run dev        # wrangler dev, http://127.0.0.1:8787
npm run deploy     # push to https://worker-env-vault.vish-ganapathy.workers.dev
```
