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

KNOWN_LOGS: Dict[str, Path] = {
    "jailbreak": LOG_DIR / "jailbreak_run.log",
    "rag_injection": LOG_DIR / "rag_injection.log",
    "rag_defense": LOG_DIR / "rag_defense.log",
    "poisoning": LOG_DIR / "poisoning.log",
    "redaction": LOG_DIR / "redaction.log",
    "metrics": LOG_DIR / "metrics.log",
    "requests": REPO_ROOT / "jailbreak_demo" / "logs" / "requests.log",
}

JAILBREAK_LOG = KNOWN_LOGS["jailbreak"]
RAG_INJECTION_LOG = KNOWN_LOGS["rag_injection"]
RAG_DEFENSE_LOG = KNOWN_LOGS["rag_defense"]
POISONING_LOG = KNOWN_LOGS["poisoning"]
REDACTION_LOG = KNOWN_LOGS["redaction"]

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


class ClearLogPayload(BaseModel):
    name: str


async def execute(task_name: str, log_filename: str, env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run_task, task_name, log_filename, env)


def append_summary(log_path: Path, summary: str) -> None:
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(f"\n[SUMMARY] {summary}\n")


def reset_log_file(log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8"):
        pass
    for name, path in KNOWN_LOGS.items():
        if path == log_path:
            LOG_OFFSETS[name] = 0


def reset_all_logs() -> None:
    for path in KNOWN_LOGS.values():
        reset_log_file(path)


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


def summarize_metrics(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not payload:
        return {}
    metrics_block = payload.get("metrics") if isinstance(payload, dict) else None
    if isinstance(metrics_block, dict):
        base = metrics_block
    else:
        base = payload
    def safe_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def safe_int(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    asr = base.get("asr", base.get("attack_success_rate"))
    leakage = base.get("leakage_count")
    latency = base.get("detection_latency_ms")
    total = base.get("total_prompts")

    return {
        "asr": safe_float(asr),
        "leakage_count": safe_int(leakage),
        "detection_latency_ms": safe_float(latency),
        "total_prompts": safe_int(total),
    }


async def run_and_broadcast_metrics(retry_on_error: bool = True) -> Dict[str, Any]:
    reset_log_file(KNOWN_LOGS["metrics"])
    result = await execute("ORCHESTRATE", "metrics.log")
    status = result.get("status")
    payload = read_json(METRICS_PATH)
    data = payload.get("data") if not payload.get("missing") else None
    summary = summarize_metrics(data)
    await sse_manager.publish(
        "metrics",
        {"source": "metrics", "data": {"raw": data, "summary": summary, "status": status}},
    )

    if status != "ok" and retry_on_error:
        asyncio.create_task(reschedule_metrics())

    return {"task": result, "summary": summary, "raw": data, "status": status}


async def reschedule_metrics(delay: float = 5.0) -> None:
    await asyncio.sleep(delay)
    await run_and_broadcast_metrics(retry_on_error=False)


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
                    summary = summarize_metrics(payload.get("data"))
                    await sse_manager.publish(
                        "metrics",
                        {"source": key, "data": {"raw": payload.get("data"), "summary": summary}},
                    )
                METRICS_STATES[key] = mtime
        await asyncio.sleep(2.0)


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(watch_logs())
    asyncio.create_task(watch_metrics())
    reset_all_logs()
    for name in KNOWN_LOGS:
        await sse_manager.publish("log_reset", {"source": name})
    asyncio.create_task(bootstrap_metrics())
    await sse_manager.publish("status", {"message": "controller_started", "timestamp": datetime.utcnow().isoformat() + "Z"})


async def bootstrap_metrics() -> None:
    await asyncio.sleep(3.0)
    await run_and_broadcast_metrics()


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "commands": list(process_runner.list_commands().keys())}


@app.post("/api/demo/jailbreak/run", response_model=DemoResponse)
async def run_jailbreak_demo() -> DemoResponse:
    reset_log_file(JAILBREAK_LOG)
    await sse_manager.publish("log_reset", {"source": "jailbreak"})
    results = []
    results.append(await execute("JAILBREAK_BLOCKED", JAILBREAK_LOG.name))
    results.append(await execute("JAILBREAK_BYPASS", JAILBREAK_LOG.name))
    summary = "Executed blocked and bypass prompts"
    append_summary(JAILBREAK_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "jailbreak", "summary": summary})
    metrics_info = await run_and_broadcast_metrics()
    return DemoResponse(status="ok", results={"steps": results, "metrics": metrics_info}, message=summary)


@app.post("/api/demo/jailbreak/defense", response_model=DemoResponse)
async def run_jailbreak_defense() -> DemoResponse:
    update_env({"STRICT_MODE": "true"})
    reset_log_file(JAILBREAK_LOG)
    await sse_manager.publish("log_reset", {"source": "jailbreak"})
    result = await execute("JAILBREAK_BYPASS", JAILBREAK_LOG.name)
    metrics_info = await run_and_broadcast_metrics()
    await sse_manager.publish("demo_completed", {"demo": "jailbreak_defense", "summary": "STRICT_MODE enabled"})
    return DemoResponse(
        status="ok",
        results={"bypass": result, "metrics": metrics_info},
        message="STRICT_MODE enforced; bypass rerun",
    )


@app.post("/api/demo/rag/injection", response_model=DemoResponse)
async def run_rag_injection() -> DemoResponse:
    reset_log_file(RAG_INJECTION_LOG)
    await sse_manager.publish("log_reset", {"source": "rag_injection"})
    build = await execute("RAG_BUILD", RAG_INJECTION_LOG.name)
    run = await execute("RAG_RUN", RAG_INJECTION_LOG.name)
    summary = "RAG injection executed"
    append_summary(RAG_INJECTION_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "rag_injection", "summary": summary})
    metrics_info = await run_and_broadcast_metrics()
    return DemoResponse(status="ok", results={"build": build, "run": run, "metrics": metrics_info}, message=summary)


@app.post("/api/demo/rag/defense", response_model=DemoResponse)
async def run_rag_defense() -> DemoResponse:
    reset_log_file(RAG_DEFENSE_LOG)
    await sse_manager.publish("log_reset", {"source": "rag_defense"})
    result = await execute("RAG_DEFENDED", RAG_DEFENSE_LOG.name)
    summary = "RAG defense run with sanitizer"
    append_summary(RAG_DEFENSE_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "rag_defense", "summary": summary})
    metrics_info = await run_and_broadcast_metrics()
    return DemoResponse(status="ok", results={"defended": result, "metrics": metrics_info}, message=summary)


@app.post("/api/demo/poisoning/run", response_model=DemoResponse)
async def run_poisoning_demo() -> DemoResponse:
    reset_log_file(POISONING_LOG)
    await sse_manager.publish("log_reset", {"source": "poisoning"})
    result = await execute("POISONING_RUN", POISONING_LOG.name)
    summary = "Poisoning demo complete"
    append_summary(POISONING_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "poisoning", "summary": summary})
    metrics_info = await run_and_broadcast_metrics()
    return DemoResponse(status="ok", results={"poisoning": result, "metrics": metrics_info}, message=summary)


@app.post("/api/demo/redaction/run", response_model=DemoResponse)
async def run_redaction_demo() -> DemoResponse:
    reset_log_file(REDACTION_LOG)
    await sse_manager.publish("log_reset", {"source": "redaction"})
    result = await execute("REDACTION_RUN", REDACTION_LOG.name)
    summary = "Redaction demo complete"
    append_summary(REDACTION_LOG, summary)
    await sse_manager.publish("demo_completed", {"demo": "redaction", "summary": summary})
    metrics_info = await run_and_broadcast_metrics()
    return DemoResponse(status="ok", results={"redaction": result, "metrics": metrics_info}, message=summary)


@app.post("/api/metrics/orchestrate", response_model=Dict[str, Any])
async def orchestrate_metrics() -> Dict[str, Any]:
    metrics_info = await run_and_broadcast_metrics()
    return {"status": metrics_info.get("status"), "metrics": metrics_info.get("raw"), "summary": metrics_info.get("summary")}


@app.get("/api/metrics", response_model=Dict[str, Any])
async def get_metrics() -> Dict[str, Any]:
    metrics = read_json(METRICS_PATH)
    redteam = read_json(REDTEAM_PATH)
    summary = summarize_metrics(metrics.get("data")) if not metrics.get("missing") else {}
    metrics["summary"] = summary
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


@app.post("/api/logs/clear")
async def clear_log(payload: ClearLogPayload) -> Dict[str, Any]:
    name = payload.name
    if name == "all":
        reset_all_logs()
        for key in KNOWN_LOGS:
            await sse_manager.publish("log_reset", {"source": key})
        return {"status": "ok", "cleared": list(KNOWN_LOGS.keys())}
    if name not in KNOWN_LOGS:
        raise HTTPException(status_code=404, detail="Log not found")
    reset_log_file(KNOWN_LOGS[name])
    await sse_manager.publish("log_reset", {"source": name})
    return {"status": "ok", "cleared": name}


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
