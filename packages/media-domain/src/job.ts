// Shared job status / engine constants for orchestrated media jobs.
// Keep this file dependency-free so it can be used across server, workers, and UI.

export type JobStatus =
	| 'queued'
	| 'fetching_metadata'
	| 'preparing'
	| 'running'
	| 'uploading'
	| 'completed'
	| 'failed'
	| 'canceled'

export type JobTerminalStatus = 'completed' | 'failed' | 'canceled'

// Typed as string[] so callers can pass raw status strings (e.g. from network)
// without fighting TS, while still keeping the runtime set limited to terminal statuses.
export const TERMINAL_JOB_STATUSES: readonly string[] = [
	'completed',
	'failed',
	'canceled',
] as const

export type EngineId =
	| 'burner-ffmpeg'
	| 'renderer-remotion'
	| 'media-downloader'
	| 'asr-pipeline'
