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

export const TERMINAL_JOB_STATUSES: JobTerminalStatus[] = [
	'completed',
	'failed',
	'canceled',
] as const

export type EngineId =
	| 'burner-ffmpeg'
	| 'renderer-remotion'
	| 'media-downloader'
	| 'asr-pipeline'
