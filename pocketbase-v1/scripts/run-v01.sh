#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if ! command -v podman >/dev/null 2>&1; then
  echo "Install Podman to run the full local stack." >&2
  exit 1
fi

exec ./scripts/podman-run.sh
