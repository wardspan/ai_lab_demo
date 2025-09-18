# RAG Redaction Defenses

- **Regex-based scrubbing**: `rag_redact.py` replaces synthetic secrets (SSNs, `secret_code=` strings, emails) with safe placeholders prior to retrieval.
- **Composability**: Extend `patterns.py` with additional organizational keywords or structured patterns to increase coverage.
- **Auditing**: Run the module against newly ingested documents before indexing to confirm redaction efficacy.

Classroom activity: add or remove patterns to illustrate how coverage impacts leakage metrics in `harness/orchestrator.py`.
