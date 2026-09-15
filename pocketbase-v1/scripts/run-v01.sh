#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ -f runner/.env ]; then
  set -a
  . ./runner/.env
  set +a
fi

if command -v podman >/dev/null 2>&1; then
  : "${ASOC_RUNNER_PASSWORD:?Set ASOC_RUNNER_PASSWORD in runner/.env}"
  podman build -t asoc-pocketbase-v01 -f Containerfile ..
  podman build -t asoc-runner-v01 -f runner/Containerfile ..
  podman network exists asoc-v01 >/dev/null 2>&1 || podman network create asoc-v01 >/dev/null
  podman volume exists asoc-pocketbase-v01-data >/dev/null 2>&1 || podman volume create asoc-pocketbase-v01-data >/dev/null
  podman rm -f asoc-runner-v01 asoc-pocketbase-v01 >/dev/null 2>&1 || true
  podman run -d --name asoc-pocketbase-v01 --network asoc-v01 -p "${ASOC_PB_PORT:-8090}:8090" -v asoc-pocketbase-v01-data:/pb/pb_data:Z -e ASOC_ADMIN_EMAIL="${ASOC_ADMIN_EMAIL:-admin@asoc.local}" -e ASOC_ADMIN_PASSWORD="${ASOC_ADMIN_PASSWORD:-password}" -e ASOC_RUNNER_PASSWORD="$ASOC_RUNNER_PASSWORD" asoc-pocketbase-v01
  until podman exec asoc-pocketbase-v01 wget -q --spider http://127.0.0.1:8090/api/health; do sleep 1; done
  podman run -d --name asoc-runner-v01 --network asoc-v01 -p "${ASOC_INTAKE_PORT:-8081}:8081" --env-file runner/.env -e POCKETBASE_URL=http://asoc-pocketbase-v01:8090 asoc-runner-v01
  echo "ASOC is running at http://127.0.0.1:${ASOC_PB_PORT:-8090}"
elif command -v docker >/dev/null 2>&1; then
  docker compose -f compose.yaml up --build
else
  echo "Install Podman or Docker Compose to run the full v0.1 stack." >&2
  exit 1
fi
