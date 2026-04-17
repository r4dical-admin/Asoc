#!/usr/bin/env sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-asoc-pocketbase-v1}"
CONTAINER_NAME="${CONTAINER_NAME:-asoc-pocketbase-v1}"
VOLUME_NAME="${VOLUME_NAME:-asoc-pocketbase-v1-data}"
HOST_PORT="${HOST_PORT:-8090}"

cd "$(dirname "$0")/../.."

podman build -t "$IMAGE_NAME" -f pocketbase-v1/Containerfile .

if podman container exists "$CONTAINER_NAME"; then
  podman rm -f "$CONTAINER_NAME" >/dev/null
fi

podman volume exists "$VOLUME_NAME" >/dev/null 2>&1 || podman volume create "$VOLUME_NAME" >/dev/null

podman run \
  --name "$CONTAINER_NAME" \
  --detach \
  --replace \
  --publish "${HOST_PORT}:8090" \
  --volume "${VOLUME_NAME}:/pb/pb_data:Z" \
  "$IMAGE_NAME"

printf 'Asoc PocketBase + frontend is running at http://127.0.0.1:%s\n' "$HOST_PORT"
printf 'PocketBase admin setup: http://127.0.0.1:%s/_/\n' "$HOST_PORT"
