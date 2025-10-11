# media-downloader container

This container powers the cloud download workflow. It accepts jobs from the Cloudflare media orchestrator, uses `yt-dlp` to fetch the source video and raw metadata, extracts an MP3 track with `ffmpeg`, uploads all artifacts (video, audio, metadata JSON) to R2 through pre-signed URLs, and reports progress back to the orchestrator.

## Environment

- `PORT` (default `8080`) – HTTP port.
- `JOB_CALLBACK_HMAC_SECRET` – shared secret for signing callbacks to the orchestrator.
- `CLASH_SUBSCRIPTION_URL` – optional, Clash/Mihomo subscription URL (HTTP(S)) used when no per-job proxy is provided.
- `CLASH_RAW_CONFIG` – optional, complete Clash configuration (YAML string). If set, it replaces the auto-generated config.
- `CLASH_MODE` (default `Rule`) – Clash routing mode.
- `MIHOMO_PORT` (default `7890`) – local HTTP proxy port exposed by mihomo.
- `MIHOMO_SOCKS_PORT` (default `7891`) – local SOCKS proxy port exposed by mihomo.
- `MIHOMO_BIN` – override path to the mihomo binary (defaults to `/usr/local/bin/mihomo`).

## Endpoints

- `POST /render` – start a download job. Payload is provided by the orchestrator and includes the source URL, quality, proxy settings, and output upload URLs.
- `GET /status/:jobId` – lightweight status for smoke testing.

## Proxy resolution order

1. If the job payload contains a proxy with `nodeUrl` (SSR / Trojan / etc.) or server credentials, the container will generate a Clash configuration on-the-fly and start `mihomo`, exposing `http://127.0.0.1:${MIHOMO_PORT}` to yt-dlp/ffmpeg.
2. If no per-job proxy exists but `CLASH_SUBSCRIPTION_URL` or `CLASH_RAW_CONFIG` is defined, mihomo is started from those settings.
3. As a final fallback, the container will fall back to `engineOptions.defaultProxyUrl` (if provided) for direct proxying.

## Notes

- Remember to mount or pass valid subscription URLs (or direct SSR/HTTP proxies from the database) so the container can reach the source platform.
- On exit, the mihomo process is terminated automatically.
