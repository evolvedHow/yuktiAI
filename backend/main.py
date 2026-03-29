"""
YuktiAI Backend — OpenAI-compatible proxy server.

Exposes a single /v1/chat/completions endpoint that forwards requests to any
configured OpenAI-compatible LLM provider, injecting the server-side API key.
The frontend never needs to hold an API key when this backend is in use.

Endpoints:
  GET  /health                  — liveness check (used by frontend)
  POST /v1/chat/completions     — streaming/non-streaming proxy

Environment variables (see .env.example):
  LLM_BASE_URL   — upstream provider base URL (no trailing slash)
                   default: https://api.groq.com/openai
  LLM_API_KEY    — upstream API key (required)
  LLM_MODEL      — default model (optional; frontend model field takes precedence)
  ALLOWED_ORIGINS — comma-separated CORS origins, default "*"
"""

import os
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("yukti-backend")

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai").rstrip("/")
LLM_API_KEY  = os.environ.get("LLM_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]

# Shared async HTTP client — reused across requests for connection pooling
_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=120, write=30, pool=5))
    log.info("Backend started. Proxying to: %s", LLM_BASE_URL)
    if not LLM_API_KEY:
        log.warning("LLM_API_KEY is not set — requests to the upstream provider will likely fail.")
    yield
    await _client.aclose()


app = FastAPI(title="YuktiAI Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True, "upstream": LLM_BASE_URL}


@app.post("/v1/chat/completions")
async def proxy_completions(request: Request):
    if not LLM_API_KEY:
        raise HTTPException(status_code=500, detail="LLM_API_KEY not configured on server.")

    body = await request.json()
    upstream_url = f"{LLM_BASE_URL}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
        # Pass these through so providers like OpenRouter can identify the app
        "HTTP-Referer": request.headers.get("HTTP-Referer", "YuktiAI"),
        "X-Title": request.headers.get("X-Title", "YuktiAI Debate Arena"),
    }

    is_streaming = body.get("stream", False)

    if is_streaming:
        async def stream_response():
            async with _client.stream(
                "POST", upstream_url, json=body, headers=headers
            ) as upstream:
                if upstream.status_code >= 400:
                    error_body = await upstream.aread()
                    log.error("Upstream error %s: %s", upstream.status_code, error_body[:200])
                    # Yield an SSE error event so the frontend can surface it
                    yield f"data: {{\"error\": \"{upstream.status_code}\"}}\n\n".encode()
                    return
                async for chunk in upstream.aiter_bytes():
                    yield chunk

        return StreamingResponse(stream_response(), media_type="text/event-stream")

    else:
        upstream = await _client.post(upstream_url, json=body, headers=headers)
        if upstream.status_code >= 400:
            log.error("Upstream error %s", upstream.status_code)
            raise HTTPException(status_code=upstream.status_code, detail=upstream.text)
        return JSONResponse(content=upstream.json(), status_code=upstream.status_code)
