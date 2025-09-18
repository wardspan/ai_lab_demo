"""Reusable regex patterns for redaction demos."""

from __future__ import annotations

import re

SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
SECRET_CODE_PATTERN = re.compile(r"secret_code\s*=\s*[A-Za-z0-9]+", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

PATTERNS = {
    "ssn": SSN_PATTERN,
    "secret_code": SECRET_CODE_PATTERN,
    "email": EMAIL_PATTERN,
}
