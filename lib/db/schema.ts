import { createId } from '@paralleldrive/cuid2'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export type ModerationSeverity = 'low' | 'medium' | 'high'

export interface CommentModeration {
    flagged: boolean
    labels: string[]
    severity: ModerationSeverity
    reason: string
    runId: string
    modelId: string
    moderatedAt: string // ISO string
}

export interface Comment {
    id: string
    author: string
    authorThumbnail?: string
    content: string
    translatedContent?: string
    likes: number
    replyCount?: number
    moderation?: CommentModeration
}

export interface TranscriptionWord {
	word: string
	start: number
	end: number
}

export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'banned'

export type PointTransactionType =
	| 'signup_bonus'
	| 'task_cost'
	| 'manual_adjust'
	| 'recharge'
	| 'refund'
	| 'ai_usage'
	| 'asr_usage'
	| 'download_usage'

export type PointResourceType = 'llm' | 'asr' | 'download'

export type TaskKind =
	| 'download'
	| 'metadata-refresh'
	| 'comments-download'
	| 'render-comments'
	| 'render-subtitles'
	| 'channel-sync'
	| 'asr'

export type TaskEngine =
	| 'media-downloader'
	| 'renderer-remotion'
	| 'burner-ffmpeg'
	| 'audio-transcoder'
	| 'asr-pipeline'

export const users = sqliteTable('users', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	nickname: text('nickname'),
	role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
	status: text('status', { enum: ['active', 'banned'] }).notNull().default('active'),
	lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const sessions = sqliteTable('sessions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull(),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})

export const pointAccounts = sqliteTable('point_accounts', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull().unique(),
	balance: integer('balance').notNull().default(0),
	frozenBalance: integer('frozen_balance').notNull().default(0),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const pointTransactions = sqliteTable('point_transactions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull(),
	delta: integer('delta').notNull(),
	balanceAfter: integer('balance_after').notNull(),
	type: text('type', {
		enum: [
			'signup_bonus',
			'task_cost',
			'manual_adjust',
			'recharge',
			'refund',
			'ai_usage',
			'asr_usage',
			'download_usage',
		],
	}).notNull(),
	refType: text('ref_type'),
	refId: text('ref_id'),
	remark: text('remark'),
	metadata: text('metadata', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const pointPricingRules = sqliteTable('point_pricing_rules', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	resourceType: text('resource_type', { enum: ['llm', 'asr', 'download'] }).notNull(),
	modelId: text('model_id'),
	unit: text('unit', { enum: ['token', 'second', 'minute'] }).notNull(),
	pricePerUnit: integer('price_per_unit').notNull(),
	// LLM only: separate prices for input/output tokens. Non-LLM rows keep these null.
	inputPricePerUnit: integer('input_price_per_unit'),
	outputPricePerUnit: integer('output_price_per_unit'),
	minCharge: integer('min_charge'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const tasks = sqliteTable('tasks', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	// 所属用户；为空表示系统级任务
	userId: text('user_id'),
	kind: text('kind', {
		enum: [
			'download',
			'metadata-refresh',
			'comments-download',
			'render-comments',
			'render-subtitles',
			'channel-sync',
			'asr',
		],
	}).notNull(),
	engine: text('engine', {
		enum: ['media-downloader', 'renderer-remotion', 'burner-ffmpeg', 'audio-transcoder', 'asr-pipeline'],
	}).notNull(),
	targetType: text('target_type', { enum: ['media', 'channel', 'system'] }).notNull(),
	targetId: text('target_id').notNull(),
	jobId: text('job_id'),
	status: text('status', {
		enum: [
			'queued',
			'fetching_metadata',
			'preparing',
			'running',
			'uploading',
			'completed',
			'failed',
			'canceled',
		],
	}),
	progress: integer('progress'),
	error: text('error'),
	jobStatusSnapshot: text('job_status_snapshot', { mode: 'json' }),
	payload: text('payload', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	startedAt: integer('started_at', { mode: 'timestamp' }),
	finishedAt: integer('finished_at', { mode: 'timestamp' }),
	updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const media = sqliteTable(
	'media',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		// 媒体归属的用户；为空表示全局/系统媒体
		userId: text('user_id'),
		title: text('title').notNull(),
		translatedTitle: text('translated_title'),
		author: text('author'),
		source: text('source', { enum: ['youtube', 'tiktok'] }).notNull(),
		quality: text('quality', { enum: ['720p', '1080p'] }).notNull(),
		thumbnail: text('thumbnail'),
		duration: integer('duration_seconds'),
		viewCount: integer('view_count').default(0),
		likeCount: integer('like_count').default(0),
		commentCount: integer('comment_count').default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		url: text('url').notNull(),
		filePath: text('file_path'),
		audioFilePath: text('audio_file_path'),
		rawMetadataPath: text('raw_metadata_path'),
		transcription: text('transcription'),
		optimizedTranscription: text('optimized_transcription'),
		transcriptionWords: text('transcription_words', { mode: 'json' }).$type<TranscriptionWord[]>(),
		translation: text('translation'),
		videoWithSubtitlesPath: text('video_with_subtitles_path'),
		videoWithInfoPath: text('video_with_info_path'),
		// 渲染配置：评论视频 Remotion 模板
		commentsTemplate: text('comments_template'),
		comments: text('comments', { mode: 'json' }).$type<Comment[]>(),
		commentsDownloadedAt: integer('comments_downloaded_at', { mode: 'timestamp' }),
		commentsModeratedAt: integer('comments_moderated_at', { mode: 'timestamp' }),
		commentsModerationModel: text('comments_moderation_model'),
		commentsFlaggedCount: integer('comments_flagged_count').default(0),
		commentsModerationSummary: text('comments_moderation_summary', {
			mode: 'json',
		}).$type<Record<string, number>>(),
		downloadBackend: text('download_backend', { enum: ['local', 'cloud'] }).default('local').notNull(),
		downloadJobId: text('download_job_id'),
		downloadStatus: text('download_status', {
			enum: [
				'queued',
				'fetching_metadata',
				'preparing',
				'downloading',
				'extracting_audio',
				'uploading',
				'completed',
				'failed',
				'canceled',
			],
		}),
		downloadError: text('download_error'),
		remoteVideoKey: text('remote_video_key'),
		remoteAudioKey: text('remote_audio_key'),
		remoteMetadataKey: text('remote_metadata_key'),
		downloadQueuedAt: integer('download_queued_at', { mode: 'timestamp' }),
		downloadCompletedAt: integer('download_completed_at', { mode: 'timestamp' }),
		rawMetadataDownloadedAt: integer('raw_metadata_downloaded_at', { mode: 'timestamp' }),
	},
	(table) => ({
		userUrlIdx: uniqueIndex('media_user_url_idx').on(table.userId, table.url),
	}),
)

export const ssrSubscriptions = sqliteTable('ssr_subscriptions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	name: text('name').notNull(),
	url: text('url').notNull(),
	lastUpdated: integer('last_updated', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const proxies = sqliteTable('proxies', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	subscriptionId: text('subscription_id'), // Remove foreign key reference
	name: text('name'),
	server: text('server').notNull(),
	port: integer('port').notNull(),
	protocol: text('protocol', { enum: ['http', 'https', 'socks4', 'socks5', 'trojan', 'vless', 'hysteria2'] }).notNull(),
	username: text('username'),
	password: text('password'),
	nodeUrl: text('ssr_url').notNull(), // Store original subscription node string (legacy column name)
	lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
	testStatus: text('test_status', { enum: ['pending', 'success', 'failed'] }).default('pending'),
	responseTime: integer('response_time'), // in milliseconds
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const userSettings = sqliteTable('user_settings', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => 'default'),
	defaultProxyId: text('default_proxy_id'),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

// ---------------- Channels & Channel Videos ----------------
export const channels = sqliteTable('channels', {
  id: text('id')
    .unique()
    .notNull()
    .$defaultFn(() => createId()),
  // 频道归属的用户；为空表示全局/系统频道
  userId: text('user_id'),
  provider: text('provider', { enum: ['youtube'] })
    .notNull()
    .default('youtube'),
  channelUrl: text('channel_url').notNull(),
  channelId: text('channel_id'),
  title: text('title'),
  thumbnail: text('thumbnail'),
  defaultProxyId: text('default_proxy_id'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  lastSyncStatus: text('last_sync_status', {
    enum: ['queued', 'running', 'completed', 'failed'],
  }),
  lastJobId: text('last_job_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const channelVideos = sqliteTable('channel_videos', {
  id: text('id')
    .unique()
    .notNull()
    .$defaultFn(() => createId()),
  channelId: text('channel_id').notNull(),
  videoId: text('video_id').notNull().unique(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  thumbnail: text('thumbnail'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  viewCount: integer('view_count'),
  likeCount: integer('like_count'),
  raw: text('raw', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ---------------- AI Providers & Models ----------------

export const aiProviders = sqliteTable(
	'ai_providers',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		// short stable identifier for code/seed (e.g. openai, packycode, deepseek, cloudflare)
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		// provider serves a single kind of models only
		kind: text('kind', { enum: ['llm', 'asr'] }).notNull(),
		// provider type is constrained by kind at runtime
		type: text('type', {
			enum: ['openai_compat', 'deepseek_native', 'cloudflare_asr'],
		}).notNull(),
		baseUrl: text('base_url'),
		apiKey: text('api_key'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		metadata: text('metadata', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		slugIdx: uniqueIndex('ai_providers_slug_idx').on(table.slug),
	}),
)

export const aiModels = sqliteTable(
	'ai_models',
	{
		// global model id; for ASR this is the Cloudflare run id (e.g. @cf/openai/whisper-tiny-en)
		id: text('id').primaryKey(),
		providerId: text('provider_id').notNull(),
		kind: text('kind', { enum: ['llm', 'asr'] }).notNull(),
		// remote provider-specific model name/run id
		remoteModelId: text('remote_model_id').notNull(),
		label: text('label').notNull(),
		description: text('description'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		capabilities: text('capabilities', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		providerRemoteIdx: uniqueIndex('ai_models_provider_remote_idx').on(
			table.providerId,
			table.remoteModelId,
		),
	}),
)
