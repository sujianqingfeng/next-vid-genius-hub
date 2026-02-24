import type { JobStatus } from '@app/media-domain'

export type LocalJobKind =
	| 'download'
	| 'render-subtitles'
	| 'render-comments'
	| 'comments-translate'
	| 'comments-review'
	| 'comments-download'
	| 'channel-sync'
	| 'thread-asset-ingest'
	| 'asr'
	| 'proxy-check'

export type JobPhase =
	| 'queued'
	| 'fetching_metadata'
	| 'preparing'
	| 'running'
	| 'uploading'
	| 'completed'
	| 'failed'
	| 'canceled'

export type LocalJobSpec<TInput = Record<string, unknown>> = {
	jobId?: string
	kind: LocalJobKind
	input: TInput
	createdAt?: number
}

export type JobOutputRef = {
	path?: string
	url?: string
	key?: string
	contentType?: string
}

export type LocalJobEvent = {
	eventSeq?: number
	eventId?: string
	eventTs?: number
	status: JobStatus
	phase?: JobPhase
	progress?: number
	message?: string
	error?: string
	outputs?: Record<string, JobOutputRef>
	metadata?: Record<string, unknown>
}

export type LocalJobStateDoc = {
	jobId: string
	kind: LocalJobKind
	status: JobStatus
	phase?: JobPhase
	progress?: number
	createdAt: number
	updatedAt: number
	startedAt?: number
	finishedAt?: number
	lastEventSeq: number
	lastEventId?: string
	message?: string
	error?: string
	input: Record<string, unknown>
	outputs: Record<string, JobOutputRef>
	metadata: Record<string, unknown>
	events: Array<{
		eventSeq: number
		eventId: string
		eventTs: number
		status: JobStatus
		phase?: JobPhase
		progress?: number
		message?: string
		error?: string
	}>
}

export type AsrTranscribeInput = {
	audioPath: string
	model?: string
	language?: string
	responseFormat?: 'verbose_json' | 'json' | 'text' | 'vtt'
	provider?: 'openai-compatible' | 'custom'
}

export type AsrTranscribeResult = {
	text?: string
	vtt?: string
	words?: Array<{ word: string; start: number; end: number }>
	raw?: unknown
}

export type LocalObjectStorePort = {
	putFile: (key: string, localPath: string, contentType?: string) => Promise<string>
	putText: (key: string, text: string, contentType?: string) => Promise<string>
}

export type ExternalPorts = {
	asr?: {
		transcribe: (input: AsrTranscribeInput) => Promise<AsrTranscribeResult>
	}
	translate?: {
		translateText: (text: string, model?: string) => Promise<string>
	}
	objectStore?: LocalObjectStorePort
}

export type LocalJobExecutorContext = {
	jobId: string
	spec: LocalJobSpec
	stateDir: string
	ports: ExternalPorts
	emit: (event: Omit<LocalJobEvent, 'eventSeq' | 'eventId' | 'eventTs'>) => Promise<LocalJobStateDoc>
	isCanceled: () => Promise<boolean>
}

export type LocalJobExecutor = (ctx: LocalJobExecutorContext) => Promise<void>

export type LocalRunResult = {
	jobId: string
	status: JobStatus
}
