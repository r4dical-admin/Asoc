#!/usr/bin/env sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-asoc-pocketbase-v1}"
CONTAINER_NAME="${CONTAINER_NAME:-asoc-pocketbase-v1}"
VOLUME_NAME="${VOLUME_NAME:-asoc-pocketbase-v1-data}"
RUNNER_IMAGE_NAME="${RUNNER_IMAGE_NAME:-asoc-runner-v1}"
RUNNER_CONTAINER_NAME="${RUNNER_CONTAINER_NAME:-asoc-runner-v1}"
NETWORK_NAME="${NETWORK_NAME:-asoc-v1}"
HOST_PORT="${HOST_PORT:-8090}"
INTAKE_PORT="${ASOC_INTAKE_PORT:-8081}"

cd "$(dirname "$0")/../.."

. ./pocketbase-v1/scripts/runner-env.sh
ensure_runner_environment ./pocketbase-v1/runner/.env ./pocketbase-v1/runner/.env.example

podman build -t "$IMAGE_NAME" -f pocketbase-v1/Containerfile .
podman build -t "$RUNNER_IMAGE_NAME" -f pocketbase-v1/runner/Containerfile .

podman rm -f "$RUNNER_CONTAINER_NAME" "$CONTAINER_NAME" >/dev/null 2>&1 || true

podman network exists "$NETWORK_NAME" >/dev/null 2>&1 || podman network create "$NETWORK_NAME" >/dev/null
podman volume exists "$VOLUME_NAME" >/dev/null 2>&1 || podman volume create "$VOLUME_NAME" >/dev/null

podman run \
  --name "$CONTAINER_NAME" \
  --detach \
  --replace \
  --network "$NETWORK_NAME" \
  --publish "${HOST_PORT}:8090" \
  --volume "${VOLUME_NAME}:/pb/pb_data:Z" \
  --env "ASOC_ADMIN_EMAIL=${ASOC_ADMIN_EMAIL:-admin@asoc.local}" \
  --env "ASOC_ADMIN_PASSWORD=${ASOC_ADMIN_PASSWORD:-password}" \
  --env "ASOC_RUNNER_PASSWORD=$ASOC_RUNNER_PASSWORD" \
  "$IMAGE_NAME"

attempt=0
until podman exec "$CONTAINER_NAME" wget -q --spider http://127.0.0.1:8090/api/health; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf 'PocketBase did not become healthy; inspect podman logs %s.\n' "$CONTAINER_NAME" >&2
    exit 1
  fi
  sleep 1
done

podman run \
  --name "$RUNNER_CONTAINER_NAME" \
  --detach \
  --replace \
  --network "$NETWORK_NAME" \
  --publish "${INTAKE_PORT}:8081" \
  --env-file ./pocketbase-v1/runner/.env \
  --env "ASOC_RUNNER_PASSWORD=$ASOC_RUNNER_PASSWORD" \
  --env "POCKETBASE_URL=http://${CONTAINER_NAME}:8090" \
  "$RUNNER_IMAGE_NAME"

printf 'ASOC frontend + API is running at http://127.0.0.1:%s\n' "$HOST_PORT"
printf 'The first runner is running in %s (intake port %s).\n' "$RUNNER_CONTAINER_NAME" "$INTAKE_PORT"
printf 'PocketBase admin setup: http://127.0.0.1:%s/_/\n' "$HOST_PORT"
