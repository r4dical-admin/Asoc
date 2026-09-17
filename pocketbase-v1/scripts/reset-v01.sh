#!/usr/bin/env sh
set -eu
CONTAINER_NAME="${CONTAINER_NAME:-asoc-pocketbase-v1}"
RUNNER_CONTAINER_NAME="${RUNNER_CONTAINER_NAME:-asoc-runner-v1}"
VOLUME_NAME="${VOLUME_NAME:-asoc-pocketbase-v1-data}"

if [ "${1:-}" != "--yes" ]; then
  echo "This removes the local ${VOLUME_NAME} volume. Re-run with --yes after taking a backup." >&2
  exit 2
fi
podman rm -f "$RUNNER_CONTAINER_NAME" "$CONTAINER_NAME" >/dev/null 2>&1 || true
podman volume rm "$VOLUME_NAME"
echo "Local v0.1 data was removed. Run scripts/run-v01.sh for a clean, no-active-task seed."
