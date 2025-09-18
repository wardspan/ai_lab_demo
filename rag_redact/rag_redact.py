"""Redact synthetic sensitive tokens from RAG documents."""

from __future__ import annotations

from typing import Dict

from .patterns import PATTERNS


def redact(text: str) -> str:
    redacted = text
    for name, pattern in PATTERNS.items():
        redacted = pattern.sub(f"[{name.upper()} REDACTED]", redacted)
    return redacted


def demo() -> None:
    sample = (
        "Contact synthetic user at demo@example.com. "
        "Store secret_code=abcd1234 securely. "
        "Never log SSN 123-45-6789."
    )
    print("Original text:")
    print(sample)
    print("\nAfter redact():")
    print(redact(sample))


if __name__ == "__main__":
    demo()
