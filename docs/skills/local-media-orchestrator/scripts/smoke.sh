#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

PROXY_URL="http://127.0.0.1:17890"
MODE="static"
SKIP_PROXY=0
SKIP_PREREQ=0
STATE_DIR=".local-jobs"
DAYS=3
SMOKE_RUN_DIR=".tmp/local-run-smoke"

usage() {
	cat <<'EOF'
Usage:
  bash docs/skills/local-media-orchestrator/scripts/smoke.sh [options]

Options:
  --mode <mode>       Smoke mode: static | minimal-run (default: static)
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

run_minimal_job() {
	local run_dir="$SMOKE_RUN_DIR"
	local fixture_dir="$run_dir/fixtures"
	local run_state_dir="$run_dir/state"
	local output_dir="$run_dir/output"
	local video_path="$fixture_dir/smoke-input.mp4"
	local subtitle_path="$fixture_dir/smoke-input.vtt"
	local payload

	need_cmd ffmpeg
	rm -rf "$run_dir"
	mkdir -p "$fixture_dir" "$run_state_dir" "$output_dir"

	echo "[smoke] generating minimal media fixture"
	ffmpeg -hide_banner -loglevel error -y \
		-f lavfi -i color=c=black:s=320x240:d=1 \
		-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
		-shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "$video_path"

	cat >"$subtitle_path" <<'EOF'
WEBVTT

00:00:00.000 --> 00:00:00.700
local-run smoke
EOF

	payload="$(printf '{"videoPath":"%s","subtitlePath":"%s","outputDir":"%s","overlapPolicy":"preserve"}' "$video_path" "$subtitle_path" "$output_dir")"
	echo "[smoke] running minimal render-subtitles job"
	pnpm local-run render-subtitles --state-dir "$run_state_dir" --payload "$payload" >/dev/null

	local job_doc
	job_doc="$(find "$run_state_dir" -maxdepth 1 -type f -name 'job_*.json' | head -n 1)"
	if [[ -z "$job_doc" ]]; then
		echo "[smoke] minimal-run failed: no job state file found in $run_state_dir" >&2
		exit 1
	fi

	node -e "const fs=require('node:fs'); const p=process.argv[1]; const doc=JSON.parse(fs.readFileSync(p,'utf8')); if(doc.status!=='completed'){console.error('[smoke] minimal-run failed: job status is '+String(doc.status)); process.exit(1)}" "$job_doc"

	if [[ ! -f "$output_dir/video.mp4" ]]; then
		echo "[smoke] minimal-run failed: expected output missing: $output_dir/video.mp4" >&2
		exit 1
	fi

	echo "[smoke] minimal-run output: $output_dir/video.mp4"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--mode)
		[[ $# -ge 2 ]] || {
			echo "[smoke] --mode requires a value" >&2
			exit 1
		}
		MODE="$2"
		shift 2
		;;
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

if [[ "$MODE" != "static" && "$MODE" != "minimal-run" ]]; then
	echo "[smoke] unsupported --mode: $MODE (expected: static|minimal-run)" >&2
	exit 1
fi

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

if [[ "$MODE" == "minimal-run" ]]; then
	run_minimal_job
fi

echo "[smoke] OK"
echo "- mode: $MODE"
echo "- local boundary/doc checks passed"
echo "- clean dry-run completed"
echo "- proxy probe completed (unless skipped)"
if [[ "$MODE" == "minimal-run" ]]; then
	echo "- minimal render-subtitles run passed"
fi
echo
echo "For expanded media execution checks, continue with docs/skills/local-media-orchestrator/references/smoke-checklist.md."
