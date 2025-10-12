This container is a minimal stub for the cloud subtitle burn-in engine (FFmpeg).

Endpoints
- POST /render — accepts a job payload with signed input/output URLs and a callbackUrl

Environment
- PORT: server port (default 8080)

Progress is reported exclusively to the Cloudflare orchestrator via the signed callback in the job payload; this stub does not expose a local status endpoint.
