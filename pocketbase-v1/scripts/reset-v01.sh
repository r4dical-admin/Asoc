#!/usr/bin/env sh
set -eu
if [ "${1:-}" != "--yes" ]; then
  echo "This removes the local asoc-pocketbase-v01-data volume. Re-run with --yes after taking a backup." >&2
  exit 2
fi
podman rm -f asoc-runner-v01 asoc-pocketbase-v01 >/dev/null 2>&1 || true
podman volume rm asoc-pocketbase-v01-data
echo "Local v0.1 data was removed. Run scripts/run-v01.sh for a clean, no-active-task seed."
