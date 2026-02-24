# Pipeline Map

## Local runner entrypoints

- `scripts/local-job-runner/src/cli.ts`
- `scripts/local-job-runner/src/command-surface.ts`
- `scripts/local-job-runner/src/orchestrator.ts`
- `scripts/local-job-runner/src/state-store.ts`
- `scripts/local-job-runner/src/dispatch.ts`
- `scripts/local-job-runner/src/executors/*`

## Local runner checks

- Boundary guard: `scripts/local-job-runner/src/check-boundary.ts`
- Skill-doc guard: `scripts/local-job-runner/src/check-skill-doc.ts`

## Reused local capability packages

- Download/audio extraction: `packages/media-node/src/index.ts`
- Subtitle rendering: `packages/media-subtitles/src/index.ts`
- Pipeline/proxy utilities: `packages/media-core/src/index.ts`
- Comments/channel providers: `packages/media-providers/src/index.ts`
- Comment timeline/layout helpers: `packages/media-comments/src/index.ts`
- Remotion compositions: `packages/remotion-project/remotion/Root.tsx`

## Existing online orchestration references (semantic parity only)

- App enqueue orchestration: `apps/web/src/lib/features/job/enqueue.ts`
- App callback routing: `apps/web/src/lib/features/job/callbacks/cf-callback.ts`
- Orchestrator start handler: `workers/media-orchestrator/handlers/start.ts`
- Orchestrator callback handler: `workers/media-orchestrator/handlers/callback.ts`
- Shared contracts: `packages/media-domain/src/orchestrator-contracts.ts`

## Local state artifacts

- Job state: `.local-jobs/<jobId>.json`
- Generated outputs: `.local-jobs/artifacts/<jobId>/**`
- Local object files (thread assets): `.local-jobs/objects/thread-assets/**`
