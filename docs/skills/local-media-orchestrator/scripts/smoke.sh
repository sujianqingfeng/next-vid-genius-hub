#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

PROXY_URL="http://127.0.0.1:17890"
SKIP_PROXY=0
SKIP_PREREQ=0
STATE_DIR=".local-jobs"
DAYS=3

usage() {
	cat <<'EOF'
Usage:
  bash docs/skills/local-media-orchestrator/scripts/smoke.sh [options]

Options:
  --proxy-url <url>   Proxy URL for provider-path probe (default: http://127.0.0.1:17890)
  --skip-proxy        Skip proxy probe step
  --skip-prereq       Skip ffmpeg/ffprobe/yt-dlp availability checks
  --state-dir <dir>   State directory used by clean dry-run (default: .local-jobs)
  --days <n>          Retention days used by clean dry-run (default: 3)
  -h, --help          Show this help
EOF
}

need_cmd() {
	local name="$1"
	if ! command -v "$name" >/dev/null 2>&1; then
		echo "[smoke] missing command: $name" >&2
		exit 1
	fi
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--proxy-url)
		[[ $# -ge 2 ]] || {
			echo "[smoke] --proxy-url requires a value" >&2
			exit 1
		}
		PROXY_URL="$2"
		shift 2
		;;
	--skip-proxy)
		SKIP_PROXY=1
		shift
		;;
	--skip-prereq)
		SKIP_PREREQ=1
		shift
		;;
	--state-dir)
		[[ $# -ge 2 ]] || {
			echo "[smoke] --state-dir requires a value" >&2
			exit 1
		}
		STATE_DIR="$2"
		shift 2
		;;
	--days)
		[[ $# -ge 2 ]] || {
			echo "[smoke] --days requires a value" >&2
			exit 1
		}
		DAYS="$2"
		shift 2
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "[smoke] unknown argument: $1" >&2
		usage
		exit 1
		;;
	esac
done

need_cmd pnpm
need_cmd curl

if [[ "$SKIP_PREREQ" -eq 0 ]]; then
	need_cmd ffmpeg
	need_cmd ffprobe
	need_cmd yt-dlp
fi

echo "[smoke] running local checks"
pnpm local-run:check

echo "[smoke] running safe clean dry-run"
pnpm local-run clean --state-dir "$STATE_DIR" --days "$DAYS" --dry-run >/dev/null

if [[ "$SKIP_PROXY" -eq 0 ]]; then
	echo "[smoke] probing provider path through proxy: $PROXY_URL"
	curl -sS --max-time 20 -x "$PROXY_URL" -I https://www.youtube.com >/dev/null
fi

cat <<'EOF'
[smoke] OK
- local boundary/doc checks passed
- clean dry-run completed
- proxy probe completed (unless skipped)

For media execution checks, continue with docs/skills/local-media-orchestrator/references/smoke-checklist.md.
EOF
