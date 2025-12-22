// Shared task kind / point resource constants to avoid scattered string literals.

export const TASK_KINDS = {
	DOWNLOAD: 'download',
	METADATA_REFRESH: 'metadata-refresh',
	COMMENTS_DOWNLOAD: 'comments-download',
	RENDER_COMMENTS: 'render-comments',
	RENDER_SUBTITLES: 'render-subtitles',
	CHANNEL_SYNC: 'channel-sync',
	ASR: 'asr',
} as const

export type TaskKindId = (typeof TASK_KINDS)[keyof typeof TASK_KINDS]

export const POINT_RESOURCE_TYPES = {
	LLM: 'llm',
	ASR: 'asr',
	DOWNLOAD: 'download',
} as const

export const POINT_TRANSACTION_TYPES = {
	SIGNUP_BONUS: 'signup_bonus',
	TASK_COST: 'task_cost',
	MANUAL_ADJUST: 'manual_adjust',
	RECHARGE: 'recharge',
	REFUND: 'refund',
	AI_USAGE: 'ai_usage',
	ASR_USAGE: 'asr_usage',
	DOWNLOAD_USAGE: 'download_usage',
} as const
