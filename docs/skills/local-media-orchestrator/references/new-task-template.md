# New Task Template

## Goal

Add one new local command while keeping a single orchestrator and JSON state behavior.

## Required changes

1. Add input/output contracts in `scripts/local-job-runner/src/contracts.ts` when needed.
2. Implement executor in `scripts/local-job-runner/src/executors/<task>.ts`.
3. Register executor in `scripts/local-job-runner/src/dispatch.ts`.
4. Add command usage to `scripts/local-job-runner/src/cli.ts` help text.
5. Update `docs/skills/local-media-orchestrator/SKILL.md` command list.

## Executor checklist

- Validate required fields in `spec.input`.
- Emit monotonic progress via `ctx.emit`.
- Check cancellation with `ctx.isCanceled()` between expensive steps.
- Emit outputs as local paths (and keys if object store port is used).
- Never mutate DB or call internal APIs.

## Optional external ports

Use only when needed:

- `ports.asr.transcribe(...)`
- `ports.translate.translateText(...)`
- `ports.objectStore.putFile(...)` / `putText(...)`

Do not perform external calls in orchestrator/state/dispatch modules.

## Done criteria

- Command runs from `pnpm local-run <task> --payload '{...}'`.
- Status file reaches terminal state.
- `pnpm local-run:check-boundary` passes.
