#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
	printf '%s\n' '[mediaflow] Docker is required for Docker mode.' >&2
	exit 1
fi

if ! docker info >/dev/null 2>&1; then
	printf '%s\n' '[mediaflow] Docker is installed but its daemon is not available. Start Docker and retry.' >&2
	exit 1
fi

docker build -t media-video-workflow:local -f "$SKILL_DIR/runtime/Dockerfile" "$SKILL_DIR"
