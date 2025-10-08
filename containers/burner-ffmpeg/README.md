This container is a minimal stub for the cloud subtitle burn-in engine (FFmpeg).

Endpoints
- POST /render — accepts a job payload with signed input/output URLs and a callbackUrl
- GET /status/:jobId — returns in-memory status (dev only)

Environment
- PORT: server port (default 8080)

