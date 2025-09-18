# Jailbreak Demo Defenses

- **Strict mode intent validation**: When `STRICT_MODE=true` the API requires clients to supply an `intent` field and blocks prompts containing the configured bypass token. Toggle off to demonstrate the impact of missing metadata.
- **Regex guardrails**: `BLOCK_PATTERNS` reject obvious attempts to request secrets or credentials.
- **Post-response policy filtering**: `policy_check.contains_sensitive` scans responses for synthetic secrets (e.g., `secret_code=`) and suppresses the message if detected.
- **Structured logging**: JSONL logs in `logs/requests.log` make it easy to audit suspicious sessions and feed downstream detection.

Suggested exercises: disable strict mode or comment out a guardrail to show increased attack success rate, then re-enable and compare using the `harness/orchestrator.py` metrics.
