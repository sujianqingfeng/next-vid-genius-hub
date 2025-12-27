import type { EngineId, JobStatus, JobTerminalStatus } from './job'

// Per-job manifest: immutable snapshot of everything a single async job needs.
// Written by the app at job-start time so Workers/containers never have to reach into the DB.
export interface JobManifest {
	jobId: string
	mediaId: string
	// Business meaning of this job (preferred over inferring from engine/options).
	purpose?: string
	engine: EngineId | string
	createdAt: number
	// Inputs resolved at job-start time. Engines must not look at DB; only at these keys/options.
	inputs: {
		videoKey?: string | null
		audioKey?: string | null
		subtitlesInputKey?: string | null
		vttKey?: string | null
		commentsKey?: string | null
		asrSourceKey?: string | null
		sourcePolicy?: 'auto' | 'original' | 'subtitles' | null
	}
	// Optional outputs contract for observability/debugging. Containers still receive presigned PUT URLs
	// from the orchestrator; this just records the canonical keys we expect to be written.
	outputs?: {
		videoKey?: string | null
		audioKey?: string | null
		metadataKey?: string | null
		vttKey?: string | null
		wordsKey?: string | null
	}
	// Best-effort snapshot of engine options for debugging.
	optionsSnapshot?: Record<string, unknown>
}

export interface OrchestratorStartJobInput extends Record<string, unknown> {
	/**
	 * Globally unique job id for this async task.
	 * The caller (app) is responsible for generating this id so it can be used
	 * consistently across DB records, manifests and orchestrator/containers.
	 */
	jobId: string
	mediaId: string
	engine: EngineId
	/**
	 * Business meaning of this job (e.g. download/comments-download/channel-sync/asr/render-subtitles).
	 * Used to make callbacks event-driven without inferring from engine/options.
	 */
	purpose?: string
	/**
	 * Optional human-readable title for the media / resource.
	 * Used only to build nicer object keys.
	 */
	title?: string | null
	options?: Record<string, unknown>
}

export interface OrchestratorStartJobResponse {
	jobId: string
}

export interface OrchestratorJobStatusResponse {
	jobId: string
	status: JobStatus
	purpose?: string
	phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
	progress?: number
	message?: string
	outputs?: {
		video?: { key?: string; url?: string }
		audio?: { key?: string; url?: string }
		audioSource?: { key?: string; url?: string }
		audioProcessed?: { key?: string; url?: string }
		metadata?: { key?: string; url?: string }
		vtt?: { key?: string; url?: string }
		words?: { key?: string; url?: string }
	}
	metadata?: Record<string, unknown>
}

export type OrchestratorCallbackOutputs = {
	video?: { url?: string; key?: string }
	audio?: { url?: string; key?: string }
	audioSource?: { url?: string; key?: string }
	audioProcessed?: { url?: string; key?: string }
	metadata?: { url?: string; key?: string }
	vtt?: { url?: string; key?: string }
	words?: { url?: string; key?: string }
}

export interface OrchestratorCallbackPayloadV2 {
	schemaVersion: 2
	eventId: string
	eventSeq: number
	eventTs: number
	status: JobTerminalStatus
	jobId: string
	mediaId: string
	engine: EngineId | string
	purpose: string
	error?: string
	durationMs?: number
	outputs?: OrchestratorCallbackOutputs

	metadata?: {
		title?: string
		author?: string
		thumbnail?: string
		viewCount?: number
		likeCount?: number
		durationSeconds?: number
		duration?: number
		lengthSeconds?: number
		source?: 'youtube' | 'tiktok'
		quality?: '720p' | '1080p'
		commentCount?: number
		model?: string
		videoBytes?: number
		audioBytes?: number
		audioSourceBytes?: number
		kind?: string
		[key: string]: unknown
	}
}
