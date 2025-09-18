#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "No .env found. Copying from .env.example"
  cp .env.example .env
fi

export $(grep -v '^#' .env | xargs)
exec docker compose up -d
