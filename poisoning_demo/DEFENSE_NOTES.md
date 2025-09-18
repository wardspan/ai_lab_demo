# Poisoning Demo Defenses

- **Provenance tags**: Track document and dataset origin so suspicious samples can be quarantined before training.
- **Holdout validation**: Continuously evaluate on trusted validation data to spot sudden accuracy drops.
- **Ingestion vetting**: Apply content filters (e.g., trigger token scans, similarity checks) prior to accepting new training data.

Try removing the poisoned samples from `POISONED_SAMPLES` to show how accuracy rebounds, or experiment with additional trigger words and mitigation heuristics.
