# YuktiAI — Debate Arena

A fully client-side AI-powered debate arena that runs entirely in the browser.
Three AI agents (Moderator, Advocate, Critic) debate civic and policy topics
with real-time token streaming, audience Q&A injection, and one-click Markdown export.

**No backend required — deployable to GitHub Pages with zero infrastructure.**

---

## Architecture

```
yuktiAI/
├── public/
│   ├── agents/
│   │   ├── moderator.md      ← Arya's persona (hot-swappable)
│   │   ├── advocate.md       ← Priya's persona
│   │   └── critic.md         ← Kiran's persona
│   └── topics.json           ← Debate topics (edit to add your own)
├── src/
│   ├── debate/
│   │   ├── llmClient.ts      ← Streaming fetch wrapper (OpenAI-compatible)
│   │   └── orchestrator.ts   ← Client-side debate loop + persona loader
│   ├── hooks/useDebate.ts    ← React hook — all state + orchestration glue
│   ├── components/           ← Sidebar, MessageCard, Transcript, Settings
│   └── utils/exportMarkdown.ts
└── .github/workflows/deploy.yml   ← Auto-deploy to GitHub Pages
```

**LLM calls go directly from the browser to your configured provider** (Groq, OpenAI,
OpenRouter, Together AI, or any OpenAI-compatible endpoint). Your API key is stored
only in `localStorage` and never touches any intermediary server.

---

## Quickstart (local)

```bash
git clone https://github.com/YOUR_USERNAME/yuktiAI.git
cd yuktiAI
npm install
npm run dev          # → http://localhost:5173
```

Then open **Settings** (⚙️ icon in the sidebar) and enter:
- **Provider** — click a preset or enter any OpenAI-compatible base URL
- **API Key** — your key for that provider
- **Model** — e.g. `llama-3.3-70b-versatile` (Groq), `gpt-4o-mini` (OpenAI)

Select a topic from the sidebar and the debate begins automatically.

---

## Deploy to GitHub Pages

### One-time setup

1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. If deploying to a *project page* (e.g. `username.github.io/yuktiAI`), add a
   repository variable: **Settings → Variables → Actions → New** →
   `VITE_BASE_PATH` = `/yuktiAI`
4. Push to `main` — the workflow builds and deploys automatically.

### User/org page (`username.github.io`)

No `VITE_BASE_PATH` needed — leave it blank or remove it.

---

## Customising Topics

Edit `public/topics.json`. Each entry needs:

```json
{
  "id":          "unique_slug",
  "title":       "Display Name",
  "description": "One-paragraph framing visible in the sidebar and injected into agent prompts."
}
```

Restart dev server (or rebuild for production) — changes are picked up on page load.

---

## Swapping Agent Personas

Edit `public/agents/moderator.md`, `advocate.md`, or `critic.md`.

Each file is a plain Markdown document injected verbatim as the agent's **system
prompt**. The orchestrator appends the topic title and description automatically.
Changes take effect immediately on the next debate start (no rebuild needed).

Guidelines:
- Keep each persona under ~600 words to stay within model context limits.
- Define: **Role**, **Tone**, **Argumentation style**, and **Hard rules**.
- The file name (`moderator`, `advocate`, `critic`) is the only coupling — the
  display names ("Arya", "Priya", "Kiran") are set in `src/components/MessageCard.tsx`.

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

---

## Keyboard / UX Notes

- **Enter** in the question field sends the question (Shift+Enter for newline).
- The **Export .md** button appears after the debate concludes.
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

No backend, no Docker, no Python. Just `npm install && npm run dev`.
