import type {
	EngineId,
	JobStatus,
	JobTerminalStatus,
	OrchestratorStartJobInput,
} from '@app/media-domain'

export type { JobManifest } from '@app/media-domain'

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

export type StartBody = OrchestratorStartJobInput

export interface StatusDoc {
	jobId: string
	status: JobStatus
	purpose?: string
	phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
	progress?: number
	outputs?: {
		video?: { key?: string; url?: string }
		audio?: { key?: string; url?: string }
		audioSource?: { key?: string; url?: string }
		audioProcessed?: { key?: string; url?: string }
		metadata?: { key?: string; url?: string }
		vtt?: { key?: string; url?: string }
		words?: { key?: string; url?: string }
	}
	error?: string
	ts: number
}
