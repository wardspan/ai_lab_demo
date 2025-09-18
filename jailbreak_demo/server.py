"""FastAPI server powering the jailbreak demo.

Features
--------
- Provider-aware: mock model (safe simulation) or local Ollama via HTTP.
- Guardrails: simple regex-based intent checks and strict intent requirement when enabled.
- Post-response policy enforcement: blocks leaks detected after generation.
- Structured logging: appends JSON lines to ``logs/requests.log`` for classroom review.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import policy_check

load_dotenv()

LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "requests.log"

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger("jailbreak_demo")

BLOCK_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"ssn", re.IGNORECASE),
    re.compile(r"social security", re.IGNORECASE),
]
ROLEPLAY_PATTERN = re.compile(re.escape(os.getenv("BYPASS_TOKEN", "roleplay")), re.IGNORECASE)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").strip().lower()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:8b")
STRICT_MODE = os.getenv("STRICT_MODE", "true").lower() in {"1", "true", "yes"}
BYPASS_TOKEN = os.getenv("BYPASS_TOKEN", "roleplay")

HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

app = FastAPI(title="AI Security Lab - Jailbreak Demo")


class CompletionRequest(BaseModel):
    text: str = Field(..., description="End-user prompt text.")
    intent: Optional[str] = Field(None, description="Optional intent metadata supplied by the client.")
    meta: Dict[str, Any] = Field(default_factory=dict)


class CompletionResponse(BaseModel):
    ok: bool
    provider: str
    response: str
    reason: Optional[str] = None
    latency_ms: Optional[float] = None


@app.get("/healthz")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok", "provider": LLM_PROVIDER}


@app.post("/complete", response_model=CompletionResponse)
async def complete(request: CompletionRequest) -> CompletionResponse:
    start = time.perf_counter()
    canonical_text = request.text.strip()

    if STRICT_MODE and not request.intent:
        log_event(
            text=request.text,
            canonical=canonical_text.lower(),
            decision="reject_no_intent",
            provider=LLM_PROVIDER,
            response="",
        )
        raise HTTPException(status_code=400, detail="intent is required in STRICT_MODE")

    guard_reason = first_block_match(canonical_text)
    if guard_reason:
        log_event(
            text=request.text,
            canonical=canonical_text.lower(),
            decision="policy_reject",
            provider=LLM_PROVIDER,
            response="",
        )
        return CompletionResponse(
            ok=False,
            provider=LLM_PROVIDER,
            response="",
            reason="policy_reject",
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    if STRICT_MODE and ROLEPLAY_PATTERN.search(canonical_text):
        log_event(
            text=request.text,
            canonical=canonical_text.lower(),
            decision="strict_roleplay_block",
            provider=LLM_PROVIDER,
            response="",
        )
        return CompletionResponse(
            ok=False,
            provider=LLM_PROVIDER,
            response="",
            reason="strict_roleplay_block",
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    if LLM_PROVIDER == "mock":
        response_text = run_mock_model(canonical_text)
        decision = "mock_response"
    elif LLM_PROVIDER == "ollama":
        response_text, decision = await run_ollama(canonical_text)
    else:
        logger.warning("Unknown LLM_PROVIDER=%s; defaulting to mock", LLM_PROVIDER)
        response_text = run_mock_model(canonical_text)
        decision = "mock_response_fallback"

    if policy_check.contains_sensitive(response_text):
        log_event(
            text=request.text,
            canonical=canonical_text.lower(),
            decision="post_response_policy_block",
            provider=LLM_PROVIDER,
            response=response_text,
        )
        return CompletionResponse(
            ok=False,
            provider=LLM_PROVIDER,
            response="",
            reason="post_response_policy_block",
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    log_event(
        text=request.text,
        canonical=canonical_text.lower(),
        decision=decision,
        provider=LLM_PROVIDER,
        response=response_text,
        latency_ms=latency_ms,
    )

    return CompletionResponse(
        ok=True,
        provider=LLM_PROVIDER,
        response=response_text,
        latency_ms=latency_ms,
    )


def first_block_match(text: str) -> Optional[str]:
    lowered = text.lower()
    for pattern in BLOCK_PATTERNS:
        if pattern.search(lowered):
            return pattern.pattern
    return None


def run_mock_model(prompt: str) -> str:
    if BYPASS_TOKEN.lower() in prompt.lower():
        return "[SIMULATED BYPASS] Acting scenario acknowledging forbidden request for educational purposes."
    return "[SIMULATED SAFE RESP] The assistant refuses to comply with unsafe or disallowed instructions."


async def run_ollama(prompt: str) -> tuple[str, str]:
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            response = await client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - network failure path
        logger.error("Ollama request failed: %s", exc)
        return (
            "[SIMULATED SAFE RESP] Provider unavailable; falling back to refusal.",
            "ollama_error",
        )

    data = response.json()
    generated = data.get("response", "")
    return generated or "[SIMULATED SAFE RESP] Empty response.", "ollama_response"


def log_event(
    *,
    text: str,
    canonical: str,
    decision: str,
    provider: str,
    response: str,
    latency_ms: Optional[float] = None,
) -> None:
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "text": text,
        "canonical": canonical,
        "provider": provider,
        "decision": decision,
        "response_preview": response[:200],
    }
    if latency_ms is not None:
        entry["latency_ms"] = latency_ms
    with LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("jailbreak_demo.server:app", host="0.0.0.0", port=8000, reload=True)
