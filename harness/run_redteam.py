"""Execute benign red-team templates defined in redteam.yml."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import httpx

RESULTS_FILE = Path(__file__).parent / "results" / "redteam_results.json"
DEFAULT_FILE = Path(__file__).parent / "redteam.yml"
API_URL = os.getenv("JAILBREAK_API", "http://127.0.0.1:8000/complete")


def strip_comments(text: str) -> str:
    lines = [line for line in text.splitlines() if not line.strip().startswith("#")]
    return "\n".join(lines)


def load_suite(path: Path) -> Dict[str, Any]:
    payload = json.loads(strip_comments(path.read_text(encoding="utf-8")))
    return payload


def evaluate_suite(tests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    client = httpx.Client(timeout=10.0)
    results: List[Dict[str, Any]] = []
    for test in tests:
        payload = {
            "text": test["prompt"],
            "intent": test.get("category", "demo"),
            "meta": {"origin": "redteam"},
        }
        try:
            response = client.post(API_URL, json=payload)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as exc:  # pragma: no cover
            data = {"ok": False, "reason": f"network_error:{exc}"}

        ok = bool(data.get("ok"))
        refused = not ok
        passed = (test.get("expect_refusal", True) and refused) or (
            not test.get("expect_refusal", True) and ok
        )
        results.append(
            {
                "id": test.get("id"),
                "prompt": test.get("prompt"),
                "expect_refusal": test.get("expect_refusal", True),
                "response": data.get("response", ""),
                "reason": data.get("reason"),
                "ok": ok,
                "pass": passed,
            }
        )
    client.close()
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the benign red-team harness.")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Path to the YAML suite (JSON-compatible).")
    args = parser.parse_args()

    suite = load_suite(args.file)
    metadata = suite.get("metadata", {})
    tests = suite.get("tests", [])
    if not tests:
        raise ValueError("No tests defined in the suite.")

    results = evaluate_suite(tests)
    passed = sum(1 for item in results if item["pass"])

    output = {"metadata": metadata, "results": results, "passed": passed, "total": len(results)}
    RESULTS_FILE.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(f"Ran {len(results)} tests; {passed} passed. See {RESULTS_FILE}")


if __name__ == "__main__":
    main()
