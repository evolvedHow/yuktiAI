# YuktiAI LLM Gateway (Cloudflare Worker)

Holds the LLM provider API keys so the debate arena — a static site on GitHub
Pages — never ships a key in its JavaScript bundle.

It speaks the OpenAI chat-completions wire format, so the frontend talks to it
exactly the way it talks to a provider directly. Streaming is passed straight
through, so token-by-token rendering still works.

---

## The key model

Two things the gateway is built around:

**Pre-defined keys.** Each *provider profile* (`groq`, `openai`, `anthropic`, …)
reads its key from a Worker secret named `KEY_<PROFILE_ID>`. Set the ones you
want available to everyone; leave the rest unset.

**Extra keys, added later.** Two ways, no redeploy of the frontend needed:

- *Server-side* — add a new secret (and, for a provider not already built in, an
  entry in the `EXTRA_PROVIDERS` var). It appears in the app's provider list on
  the next page load.
- *Client-side (BYOK)* — a user can paste their own key in the app's Settings and
  pick **Use my own key**. The browser sends it as an `Authorization: Bearer`
  header and the gateway forwards that instead of any server-held key. Nothing
  is stored.

Built-in profiles live in [`src/providers.ts`](src/providers.ts).

---

## Setup

```bash
cd worker
npm install
```

### Local development

```bash
cp .dev.vars.example .dev.vars   # add at least one KEY_* value
npx wrangler dev                 # → http://localhost:8787
```

Then in the app's **Settings → Gateway**, set the URL to `http://localhost:8787`.

### Deploy

```bash
npx wrangler deploy
```

Then set your keys as secrets (these are encrypted at rest and never appear in
`wrangler.jsonc` or the dashboard):

```bash
npx wrangler secret put KEY_GROQ
```

```bash
npx wrangler secret put KEY_OPENAI
```

Repeat for any provider you want to offer. To check what landed:

```bash
npx wrangler secret list
```

### Lock it down before sharing the URL

Two settings in `wrangler.jsonc` / secrets, both worth doing for a public deploy:

1. **`ALLOWED_ORIGINS`** — replace `"*"` with your real origins, e.g.
   `"https://your-user.github.io,http://localhost:5173"`. Browsers will refuse
   responses from anywhere else.
2. **`ACCESS_PASSCODE`** — a shared secret users enter once in Settings:

   ```bash
   npx wrangler secret put ACCESS_PASSCODE
   ```

   Without it, anyone who finds the URL can spend your API credits. A per-IP rate
   limit (60 requests/minute) is on by default either way.

---

## Adding a provider that isn't built in

Set `EXTRA_PROVIDERS` in `wrangler.jsonc` to a JSON array (as a string):

```jsonc
"EXTRA_PROVIDERS": "[{\"id\":\"my-vllm\",\"label\":\"Self-hosted vLLM\",\"baseUrl\":\"https://llm.example.com/v1\",\"defaultModel\":\"qwen2.5-32b\"}]"
```

Then add its key and deploy:

```bash
npx wrangler secret put KEY_MY_VLLM && npx wrangler deploy
```

The id → secret-name rule is: uppercase, and every run of non-alphanumeric
characters becomes a single `_`. So `my-vllm` → `KEY_MY_VLLM`.

An entry whose `id` matches a built-in overrides that built-in — handy for
pinning a different default model. To point an existing profile at a different
host without redefining it, set `BASE_URL_<ID>` instead.

---

## API

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. Reports how many profiles have a server key and whether a passcode is required. |
| `GET /providers` | Profile list for the Settings UI. Returns `hasServerKey` booleans — never the keys. |
| `POST /v1/chat/completions` | OpenAI-compatible proxy. Streams when `stream: true`. |
| `POST /verify-links` | Fetches each supplied URL and reports whether it resolves. |

### `POST /verify-links`

The debate transcript uses this to tell a real citation from an invented one. A
browser cannot do it — CORS blocks cross-origin requests to arbitrary sites —
so it has to run here.

```bash
curl -X POST https://your-gateway.workers.dev/verify-links \
  -H 'Content-Type: application/json' \
  -d '{"urls":["https://example.com","https://example.com/nope"]}'
```

Verdicts: `live`, `missing` (404/410), `unreachable` (DNS/TLS/timeout),
`restricted` (401/403/429 — exists but wouldn't confirm), `server-error`,
`blocked` (we refused to fetch it).

Only `missing` and `unreachable` are treated as fabrication upstream.
`restricted` deliberately is not — plenty of real sites block edge fetchers, and
calling those fake would be worse than missing a few.

Because the URLs come from LLM output, which the topic text and audience
questions can steer, the endpoint is guarded against being used to probe
networks it shouldn't: only `http`/`https`, and loopback, private, link-local
(cloud metadata at `169.254.169.254`), CGNAT and internal-only hostnames are all
refused. Requests are capped at 12 URLs with a 6-second timeout each.

Request headers on `/v1/chat/completions`:

| Header | Meaning |
|---|---|
| `X-Yukti-Provider` | Profile id. Falls back to a `provider` field in the body, then `DEFAULT_PROVIDER`. |
| `X-Yukti-Passcode` | Required when `ACCESS_PASSCODE` is set. Compared in constant time. |
| `Authorization` | Optional `Bearer <key>` — used instead of the server-held key (BYOK). |

Quick check once deployed:

```bash
curl https://yukti-llm-gateway.<your-subdomain>.workers.dev/providers
```

---

## Logs

```bash
npx wrangler tail
```

Upstream failures are logged as structured JSON with the provider id, HTTP
status, and whether a server or caller key was used — never the key itself.
