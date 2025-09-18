"""FastAPI controller for the AI Security Lab web UI."""

from __future__ import annotations

import asyncio
import json
import os
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import orjson
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import process_runner
from .process_runner import run_task
from .sse import sse_manager

REPO_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

JAILBREAK_LOG = LOG_DIR / "jailbreak_run.log"
RAG_INJECTION_LOG = LOG_DIR / "rag_injection.log"
RAG_DEFENSE_LOG = LOG_DIR / "rag_defense.log"
POISONING_LOG = LOG_DIR / "poisoning.log"
REDACTION_LOG = LOG_DIR / "redaction.log"

KNOWN_LOGS: Dict[str, Path] = {
    "jailbreak": JAILBREAK_LOG,
    "rag_injection": RAG_INJECTION_LOG,
    "rag_defense": RAG_DEFENSE_LOG,
    "poisoning": POISONING_LOG,
    "redaction": REDACTION_LOG,
    "requests": REPO_ROOT / "jailbreak_demo" / "logs" / "requests.log",
    "metrics": LOG_DIR / "metrics.log",
}

METRICS_PATH = REPO_ROOT / "harness" / "results" / "metrics.json"
REDTEAM_PATH = REPO_ROOT / "harness" / "results" / "redteam_results.json"
ENV_PATH = REPO_ROOT / ".env"

LOG_OFFSETS: Dict[str, int] = {name: 0 for name in KNOWN_LOGS}
METRICS_STATES: Dict[str, float] = {"metrics": 0.0, "redteam": 0.0}

app = FastAPI(title="AI Security Lab Controller", default_response_class=JSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"]
    ,
    allow_headers=["*"],
)


class DemoResponse(BaseModel):
    status: str
    results: Any = None
    message: Optional[str] = None


class SettingsPayload(BaseModel):
    provider: str = Field(..., pattern=r"^(mock|ollama)$")
    strictMode: bool
    bypassToken: str
    ollamaModel: str


class RestartPayload(BaseModel):
    service: str


async def execute(task_name: str, log_filename: str, env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run_task, task_name, log_filename, env)


def append_summary(log_path: Path, summary: str) -> None:
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(f"\n[SUMMARY] {summary}\n")


def tail_file(path: Path, lines: int = 200) -> Dict[str, Any]:
    if not path.exists():
        return {"lines": [], "missing": True}
    dq: deque[str] = deque(maxlen=lines)
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            dq.append(line.rstrip("\n"))
    return {"lines": list(dq), "missing": False}


def read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"data": None, "missing": True}
    try:
        return {"data": orjson.loads(path.read_text(encoding="utf-8")), "missing": False}
    except orjson.JSONDecodeError:
        return {"data": None, "missing": True, "error": "invalid_json"}


def update_env(updates: Dict[str, str]) -> Dict[str, Any]:
    if not ENV_PATH.exists():
        raise HTTPException(status_code=400, detail=".env file not found; create one at repo root")

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    output_lines = []
    seen = set()
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output_lines.append(line)
            continue
        key, _, _ = line.partition("=")
        key = key.strip()
        if key in updates:
            output_lines.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            output_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            output_lines.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    return {"updated": list(updates.keys())}


def allowed_service(service: str) -> bool:
    return service in {"mock-llm", "controller_api", "lab_webui", "rag"}


def restart_service(service: str) -> Dict[str, Any]:
    if not allowed_service(service):
        raise HTTPException(status_code=403, detail="Service restart not permitted")
    try:
        output = subprocess_run(["docker", "compose", "restart", service])
        return {"status": "ok", "output": output}
    except Exception as exc:  # pragma: no cover - fallback when docker not available
        return {"status": "failed", "message": str(exc)}


def subprocess_run(cmd: list[str]) -> str:
    import subprocess

    result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "restart failed")
    return result.stdout.strip()


async def watch_logs() -> None:
    global LOG_OFFSETS
    while True:
        for name, path in KNOWN_LOGS.items():
            try:
                current_size = path.stat().st_size
            except FileNotFoundError:
                LOG_OFFSETS[name] = 0
                continue
            last_offset = LOG_OFFSETS.get(name, 0)
            if current_size < last_offset:
                last_offset = 0
            if current_size > last_offset:
                with path.open("r", encoding="utf-8", errors="ignore") as fh:
                    fh.seek(last_offset)
                    new_data = fh.read()
                LOG_OFFSETS[name] = current_size
                for line in filter(None, new_data.splitlines()):
                    await sse_manager.publish("log", {"source": name, "line": line})
        await asyncio.sleep(1.0)


async def watch_metrics() -> None:
    while True:
        for key, path in {"metrics": METRICS_PATH, "redteam": REDTEAM_PATH}.items():
            try:
                mtime = path.stat().st_mtime
            except FileNotFoundError:
                METRICS_STATES[key] = 0.0
                continue
            if mtime > METRICS_STATES.get(key, 0.0):
                payload = read_json(path)
                if not payload.get("missing"):
                    await sse_manager.publish("metrics", {"source": key, "data": payload["data"]})
                METRICS_STATES[key] = mtime
        await asyncio.sleep(2.0)


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(watch_logs())
    asyncio.create_task(watch_metrics())
    await sse_manager.publish("status", {"message": "controller_started", "timestamp": datetime.utcnow().isoformat() + "Z"})


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "commands": list(process_runner.list_commands().keys())}


@app.post("/api/demo/jailbreak/run", response_model=DemoResponse)
async def run_jailbreak_demo() -> DemoResponse:
    results = []
    results.append(await execute("JAILBREAK_BLOCKED", JAILBREAK_LOG.name))
    results.append(await execute("JAILBREAK_BYPASS", JAILBREAK_LOG.name))
    summary = "Executed blocked and bypass prompts"
    append_summary(JAILBREAK_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "jailbreak", "summary": summary})
    return DemoResponse(status="ok", results=results, message=summary)


@app.post("/api/demo/jailbreak/defense", response_model=DemoResponse)
async def run_jailbreak_defense() -> DemoResponse:
    update_env({"STRICT_MODE": "true"})
    result = await execute("JAILBREAK_BYPASS", JAILBREAK_LOG.name)
    orchestrate = await execute("ORCHESTRATE", "metrics.log")
    metrics_payload = read_json(METRICS_PATH)
    await sse_manager.publish("demo_completed", {"demo": "jailbreak_defense", "summary": "STRICT_MODE enabled"})
    await sse_manager.publish("metrics", {"source": "metrics", "data": metrics_payload.get("data")})
    return DemoResponse(
        status="ok",
        results={"bypass": result, "metrics": orchestrate},
        message="STRICT_MODE enforced; bypass rerun",
    )


@app.post("/api/demo/rag/injection", response_model=DemoResponse)
async def run_rag_injection() -> DemoResponse:
    build = await execute("RAG_BUILD", RAG_INJECTION_LOG.name)
    run = await execute("RAG_RUN", RAG_INJECTION_LOG.name)
    summary = "RAG injection executed"
    append_summary(RAG_INJECTION_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "rag_injection", "summary": summary})
    return DemoResponse(status="ok", results={"build": build, "run": run}, message=summary)


@app.post("/api/demo/rag/defense", response_model=DemoResponse)
async def run_rag_defense() -> DemoResponse:
    result = await execute("RAG_DEFENDED", RAG_DEFENSE_LOG.name)
    summary = "RAG defense run with sanitizer"
    append_summary(RAG_DEFENSE_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "rag_defense", "summary": summary})
    return DemoResponse(status="ok", results=result, message=summary)


@app.post("/api/demo/poisoning/run", response_model=DemoResponse)
async def run_poisoning_demo() -> DemoResponse:
    result = await execute("POISONING_RUN", POISONING_LOG.name)
    summary = "Poisoning demo complete"
    append_summary(POISONING_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "poisoning", "summary": summary})
    return DemoResponse(status="ok", results=result, message=summary)


@app.post("/api/demo/redaction/run", response_model=DemoResponse)
async def run_redaction_demo() -> DemoResponse:
    result = await execute("REDACTION_RUN", REDACTION_LOG.name)
    summary = "Redaction demo complete"
    append_summary(REDACTION_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "redaction", "summary": summary})
    return DemoResponse(status="ok", results=result, message=summary)


@app.post("/api/metrics/orchestrate", response_model=Dict[str, Any])
async def orchestrate_metrics() -> Dict[str, Any]:
    await execute("ORCHESTRATE", "metrics.log")
    payload = read_json(METRICS_PATH)
    data = payload.get("data") if not payload.get("missing") else None
    await sse_manager.publish("metrics", {"source": "metrics", "data": data})
    return {"status": "ok", "metrics": data}


@app.get("/api/metrics", response_model=Dict[str, Any])
async def get_metrics() -> Dict[str, Any]:
    metrics = read_json(METRICS_PATH)
    redteam = read_json(REDTEAM_PATH)
    return {"metrics": metrics, "redteam": redteam}


@app.get("/api/logs/tail")
async def get_log_tail(name: str, lines: int = 200) -> Dict[str, Any]:
    if name not in KNOWN_LOGS:
        raise HTTPException(status_code=404, detail="Log not found")
    return tail_file(KNOWN_LOGS[name], lines)


@app.get("/api/logs/stream")
async def stream_logs() -> StreamingResponse:
    async def event_generator():
        async for message in sse_manager.subscribe():
            yield message

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/settings")
async def update_settings(payload: SettingsPayload) -> Dict[str, Any]:
    updates = {
        "LLM_PROVIDER": payload.provider,
        "STRICT_MODE": "true" if payload.strictMode else "false",
        "BYPASS_TOKEN": payload.bypassToken,
        "OLLAMA_MODEL": payload.ollamaModel,
    }
    update_env(updates)
    await sse_manager.publish("status", {"message": "settings_updated", "timestamp": datetime.utcnow().isoformat() + "Z"})
    return {"status": "ok", "updates": updates, "note": "Restart mock-llm to apply."}


@app.post("/api/services/restart")
async def restart_services(payload: RestartPayload) -> Dict[str, Any]:
    if not allowed_service(payload.service):
        raise HTTPException(status_code=403, detail="Service restart not permitted")
    result = restart_service(payload.service)
    return result


@app.get("/api/settings")
async def get_settings() -> Dict[str, Any]:
    if not ENV_PATH.exists():
        return {"missing": True}
    current = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        current[key.strip()] = value.strip()
    return current


@app.middleware("http")
async def json_middleware(request: Request, call_next):
    response = await call_next(request)
    if isinstance(response, JSONResponse):
        return response
    if hasattr(response, "body_iterator"):
        return response
    return JSONResponse(response)


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(Exception)
async def generic_handler(_: Request, exc: Exception):  # pragma: no cover - defensive
    return JSONResponse({"detail": str(exc)}, status_code=500)
