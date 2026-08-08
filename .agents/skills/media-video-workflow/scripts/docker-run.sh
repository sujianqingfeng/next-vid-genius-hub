#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
	printf '%s\n' '[mediaflow] Docker is required for Docker mode.' >&2
	exit 1
fi

if ! docker info >/dev/null 2>&1; then
	printf '%s\n' '[mediaflow] Docker is installed but its daemon is not available. Start Docker and retry.' >&2
	exit 1
fi

ENV_ARGS=()
for name in MEDIAFLOW_ASR_API_URL MEDIAFLOW_ASR_API_KEY MEDIAFLOW_ASR_MODEL; do
	if [[ -n "${!name:-}" ]]; then
		ENV_ARGS+=(--env "$name")
	fi
done

docker run --rm -i -v "$PWD:/work" -w /work "${ENV_ARGS[@]}" media-video-workflow:local "$@"
