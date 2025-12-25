import type { EngineId, JobStatus, JobTerminalStatus } from '@app/media-domain'

export interface Env {
	JOBS: KVNamespace
	RENDER_BUCKET?: R2Bucket
	// When true, skip R2 binding and use S3-compatible API only (useful in local dev where R2 is Miniflare-backed).
	FORCE_S3_STORAGE?: string
	JOB_TTL_SECONDS?: string
	CONTAINER_BASE_URL?: string
	CONTAINER_BASE_URL_REMOTION?: string
	CONTAINER_BASE_URL_DOWNLOADER?: string
	APP_BASE_URL?: string
	JOB_CALLBACK_HMAC_SECRET?: string
	// Workers AI (REST credentials) for ASR pipeline
	CF_AI_ACCOUNT_ID?: string
	CF_AI_API_TOKEN?: string
	// Generic S3-compatible config (R2/MinIO)
	S3_ENDPOINT?: string
	S3_INTERNAL_ENDPOINT?: string
	S3_ACCESS_KEY_ID?: string
	S3_SECRET_ACCESS_KEY?: string
	S3_BUCKET_NAME?: string
	S3_STYLE?: 'vhost' | 'path'
	S3_REGION?: string
	RENDER_JOB_DO?: DurableObjectNamespace
	// Containers Durable Object bindings (optional; when configured, will be used instead of raw URLs)
	MEDIA_DOWNLOADER?: DurableObjectNamespace
	BURNER_FFMPEG?: DurableObjectNamespace
	RENDERER_REMOTION?: DurableObjectNamespace
	// Local/prod vars referenced via (env as any) in some handlers
	ORCHESTRATOR_BASE_URL_CONTAINER?: string
	PUT_EXPIRES?: string | number
	PREFER_EXTERNAL_CONTAINERS?: string
	NO_CF_CONTAINERS?: string
}

export const TERMINAL_STATUSES: JobTerminalStatus[] = [
	'completed',
	'failed',
	'canceled',
]

// Per-job manifest: immutable snapshot of what a single async job needs.
// This is written by the app at job-start time so that the Worker and
// containers never have to reach into the primary DB.
export interface JobManifest {
	jobId: string
	mediaId: string
	// Business meaning of this job (preferred over inferring from engine/options).
	purpose?: string
	engine: EngineId | string
	createdAt: number
	inputs?: {
		videoKey?: string | null
		audioKey?: string | null
		subtitlesInputKey?: string | null
		vttKey?: string | null
		commentsKey?: string | null
		asrSourceKey?: string | null
		sourcePolicy?: 'auto' | 'original' | 'subtitles' | null
	}
	outputs?: {
		videoKey?: string | null
		audioKey?: string | null
		metadataKey?: string | null
		vttKey?: string | null
		wordsKey?: string | null
	}
	optionsSnapshot?: Record<string, unknown>
}

export interface StartBody {
	jobId: string
	mediaId: string
	engine: EngineId
	// Business meaning of this job (e.g. download/comments-download/channel-sync/asr/render-subtitles).
	purpose?: string
	title?: string | null
	options?: Record<string, unknown>
}

export interface StatusDoc {
	jobId: string
	status: JobStatus
	purpose?: string
	phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
	progress?: number
	outputKey?: string
	outputMetadataKey?: string
	error?: string
	ts: number
}
