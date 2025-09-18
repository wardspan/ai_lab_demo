# AI Security Lab

This repository contains a self-contained set of classroom-ready demonstrations focused on AI security failure modes and mitigations. All examples rely on **synthetic data**, run locally, and emphasize safe experimentation. Instructors can swap between a mock LLM (safe simulation) and a local Ollama instance to illustrate the effect of provider changes.

## Safety Rules
- Local-only experimentation. Do not expose the services to the public internet.
- Synthetic payloads only. Never add real secrets, PII, or live exploit strings to this repo.
- Instructor controls red-team prompts. `harness/redteam.yml` ships with benign templates; add aggressive prompts locally at your own discretion.
- Logging is enabled by default. Review `logs/` before sharing outputs to avoid leaking sensitive local prompts.
- Do not publish bypass prompts. Treat any simulated bypass output as confidential training material.

## Quickstart
1. Install prerequisites: Docker, Docker Compose, Python 3.11 (if you prefer local execution).
2. Copy the environment template and adjust as needed:
   ```bash
   cp .env.example .env
   ```
3. Launch the demo services:
   ```bash
   docker compose up -d
   ```
4. Exercise the jailbreak demo:
   ```bash
   bash jailbreak_demo/client.sh
   ```
5. Build sample RAG documents and run the injection demo (defended and undefended):
   ```bash
   python rag_demo/build_docs.py
   python rag_demo/rag_demo.py
   python rag_demo/rag_demo.py --defended
   ```
6. Run the metrics harness to observe ASR/latency:
   ```bash
   python harness/orchestrator.py
   ```

See the Acceptance Tests section below for more demo commands.

## Environment Configuration
The lab uses environment variables to toggle providers and defenses. `server.py` and supporting scripts load the following variables (defaults shown):

| Variable       | Default                  | Description |
|----------------|--------------------------|-------------|
| `LLM_PROVIDER` | `mock`                   | Selects `mock` or `ollama` provider.
| `OLLAMA_HOST`  | `http://127.0.0.1:11434` | Local Ollama endpoint.
| `OLLAMA_MODEL` | `llama3:8b`              | Model name passed to Ollama.
| `BYPASS_TOKEN` | `roleplay`               | Token that triggers simulated bypass in mock mode.
| `STRICT_MODE`  | `true`                   | Requires `intent` field and blocks suspicious tokens.
| `LOG_LEVEL`    | `INFO`                   | Logging verbosity.

When `LLM_PROVIDER=ollama`, ensure you have already installed Ollama and pulled the desired model, e.g. `ollama pull llama3:8b`. You can run Ollama directly on the host or adapt the commented service in `docker-compose.yml`.

## Switching Providers
1. Set `LLM_PROVIDER=ollama` in `.env`.
2. Start (or confirm) a local Ollama instance listening on `http://127.0.0.1:11434`.
3. Restart the docker compose stack or local server to pick up the new provider.

If Ollama is unavailable, the server falls back to mock mode and prints a warning.

## Demos Overview
### Jailbreak Demo (`jailbreak_demo/`)
- `server.py`: FastAPI app with mock and Ollama providers, regex guardrails, strict intent checks, and post-response policy filtering (`policy_check.py`).
- `client.sh`: Sample curl commands that illustrate a blocked prompt vs. a simulated [SIMULATED BYPASS] response.
- Toggle defenses via `STRICT_MODE` or by editing `BLOCK_PATTERNS`.

### RAG Injection Demo (`rag_demo/`)
- `build_docs.py`: Generates synthetic documentation and a planted HTML instruction token.
- `rag_demo.py`: Performs naive retrieval and shows how the injection executes unless sanitized (`--defended` flag).
- `sanitizer.py`: Implements `strip_instruction_tokens` plus simple unit tests.

### Data Poisoning Demo (`poisoning_demo/`)
- Demonstrates how poisoned samples flip a logistic regression classifier trained on synthetic text. Includes mitigation ideas in `DEFENSE_NOTES.md`.

### RAG Redaction (`rag_redact/`)
- Provides safe regex patterns in `patterns.py` and redaction logic in `rag_redact.py` to scrub synthetic secrets.

### Harness (`harness/`)
- `orchestrator.py`: Runs prompts against the jailbreak API, computes attack success rate (ASR), leakage count, and detection latency, then writes `harness/results/metrics.json`.
- `run_redteam.py`: Loads `harness/redteam.yml` and executes benign template tests. Instructors can add their own prompts locally.

### Tools (`tools/`)
- `start_lab.sh`: Convenience script to source `.env` and launch Docker Compose.
- `generate_zip.py`: Utility to create a zip archive of the repository for distribution.

## Acceptance Tests
Run the commands below to validate the lab. Each step should produce the described outcome.

1. `docker compose up -d` launches the mock LLM service. POST `/complete` should return a JSON response.
2. `bash jailbreak_demo/client.sh` triggers both a blocked prompt (expect `{ "ok": false, "reason": "policy_reject" }`) and a mock bypass (expect `[SIMULATED BYPASS]`).
3. `python rag_demo/build_docs.py && python rag_demo/rag_demo.py` shows an injection firing with `[SIMULATED EXECUTE]` when undefended.
4. `python rag_demo/rag_demo.py --defended` produces `[SIMULATED SAFE RESP]`, demonstrating the sanitizer.
5. `python poisoning_demo/poisoning_demo.py` prints baseline vs post-poison predictions and accuracy shifts.
6. `python rag_redact/rag_redact.py` prints pre/post redaction examples.
7. `python harness/orchestrator.py` writes `harness/results/metrics.json`.

## Troubleshooting & FAQ
- **Server not responding?** Confirm Docker containers are healthy with `docker compose ps`. If Ollama is selected but unreachable, fallback to mock mode.
- **Want more prompts?** Edit `harness/redteam.yml` locally. Keep them synthetic and safe.
- **Need fresh docs?** Re-run `python rag_demo/build_docs.py` to regenerate the synthetic corpus.
- **Where are logs?** Check `jailbreak_demo/logs/requests.log` (created at runtime). Rotate or delete between sessions as needed.

## License
See [LICENSE](LICENSE) for licensing details.
