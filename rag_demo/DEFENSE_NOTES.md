# RAG Demo Defenses

- **Sanitizer (`--defended`)**: `strip_instruction_tokens` removes hidden instruction markers (HTML comments, secret codes) before the prompt reaches the model.
- **Corpus hygiene**: `build_docs.py` can be extended to tag documents with provenance metadata; inspect them prior to indexing.
- **Top-K tuning**: Reducing K can lower exposure to poisoned documents. Experiment by running `python rag_demo/rag_demo.py --k 1`.

Suggested classroom flow: run the demo once without `--defended` to observe `[SIMULATED EXECUTE]`, then enable the flag to show `[SIMULATED SAFE RESP]` and reduced ASR in the metrics harness.
