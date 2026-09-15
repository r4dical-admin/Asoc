#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
name="asoc-smoke-$PPID"
runner_name="$name-runner"
network="$name-network"
volume="$name-data"
cleanup() { podman rm -f "$runner_name" "$name" >/dev/null 2>&1 || true; podman volume rm "$volume" >/dev/null 2>&1 || true; podman network rm "$network" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
podman build -t asoc-pocketbase-smoke -f Containerfile ..
podman build -t asoc-runner-smoke -f runner/Containerfile ..
podman network create "$network" >/dev/null
podman volume create "$volume" >/dev/null
podman run -d --name "$name" --network "$network" -p 127.0.0.1::8090 -v "$volume:/pb/pb_data:Z" -e ASOC_RUNNER_PASSWORD=asoc-smoke-runner-password asoc-pocketbase-smoke >/dev/null
port="$(podman port "$name" 8090/tcp | sed 's/.*://')"
until curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; do sleep 1; done
POCKETBASE_URL="http://127.0.0.1:$port" ASOC_RUNNER_PASSWORD="asoc-smoke-runner-password" node tests/api-smoke.mjs
podman run -d --name "$runner_name" --network "$network" -e "POCKETBASE_URL=http://$name:8090" -e ASOC_RUNNER_PASSWORD=asoc-smoke-runner-password -e DELEGATE_LAUNCH_MODE=mock -e AI_PROVIDER=mock asoc-runner-smoke >/dev/null
POCKETBASE_URL="http://127.0.0.1:$port" node tests/runner-smoke.mjs
npm --prefix frontend run build
npm --prefix runner test
