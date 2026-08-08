#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$SKILL_DIR/runtime"

if ! command -v node >/dev/null 2>&1; then
	printf '%s\n' '[mediaflow] Node.js 20 or later is required.' >&2
	exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
	printf '%s\n' '[mediaflow] Node.js 20 or later is required.' >&2
	exit 1
fi

printf '%s\n' '[mediaflow] installing standalone Remotion runtime dependencies'
npm ci --prefix "$RUNTIME_DIR" --omit=dev

printf '%s\n' '[mediaflow] ensuring the Remotion browser runtime is available'
(
	cd "$RUNTIME_DIR"
	node src/ensure-browser.mjs
)

printf '%s\n' '[mediaflow] host runtime is ready'
