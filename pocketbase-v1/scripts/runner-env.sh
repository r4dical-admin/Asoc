#!/usr/bin/env sh

ensure_runner_environment() {
  runner_env_file="$1"
  runner_env_example="$2"

  if [ ! -f "$runner_env_file" ]; then
    cp "$runner_env_example" "$runner_env_file"
  fi
  chmod 600 "$runner_env_file"

  set -a
  # shellcheck disable=SC1090
  . "$runner_env_file"
  set +a

  if [ -z "${ASOC_RUNNER_PASSWORD:-}" ]; then
    if command -v openssl >/dev/null 2>&1; then
      ASOC_RUNNER_PASSWORD="$(openssl rand -hex 32)"
    else
      ASOC_RUNNER_PASSWORD="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    fi
    printf '\nASOC_RUNNER_PASSWORD=%s\n' "$ASOC_RUNNER_PASSWORD" >> "$runner_env_file"
    chmod 600 "$runner_env_file"
    printf 'Generated and saved the first runner credential in %s (mode 0600).\n' "$runner_env_file"
  fi

  export ASOC_RUNNER_PASSWORD
}
