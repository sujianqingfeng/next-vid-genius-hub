import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { CommentsTemplateConfig } from '@app/remotion-project/types'
import type {
	ThreadContentBlock,
	ThreadPostMetrics,
	ThreadSource,
} from '~/lib/domain/thread/types'
import { createId } from '~/lib/shared/utils/id'

export interface Comment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	translatedContent?: string
	likes: number
	replyCount?: number
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

export type AgentActionKind =
	| 'download'
	| 'asr'
	| 'optimize'
	| 'translate'
	| 'render'

export type AgentActionStatus =
	| 'proposed'
	| 'canceled'
	| 'running'
	| 'completed'
	| 'failed'

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
	| 'asr-pipeline'

export type JobEventSource = 'callback' | 'reconciler'

export const users = sqliteTable('users', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	nickname: text('nickname'),
	role: text('role', { enum: ['user', 'admin'] })
		.notNull()
		.default('user'),
	status: text('status', { enum: ['active', 'banned'] })
		.notNull()
		.default('active'),
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

export const agentActions = sqliteTable('agent_actions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull(),
	kind: text('kind', {
		enum: ['download', 'asr', 'optimize', 'translate', 'render'],
	}).notNull(),
	status: text('status', {
		enum: ['proposed', 'canceled', 'running', 'completed', 'failed'],
	})
		.notNull()
		.default('proposed'),
	params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
	estimate: text('estimate', { mode: 'json' }).$type<Record<string, unknown>>(),
	result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
	error: text('error'),
	confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
	completedAt: integer('completed_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const agentChatSessions = sqliteTable('agent_chat_sessions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull(),
	title: text('title').notNull().default('New chat'),
	modelId: text('model_id'),
	lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

export const agentChatMessages = sqliteTable(
	'agent_chat_messages',
	{
		id: text('id').notNull(),
		sessionId: text('session_id').notNull(),
		userId: text('user_id').notNull(),
		role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
		seq: integer('seq').notNull(),
		message: text('message', { mode: 'json' })
			.notNull()
			.$type<Record<string, unknown>>(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		sessionMsgIdIdx: uniqueIndex(
			'agent_chat_messages_session_id_msg_id_idx',
		).on(table.sessionId, table.id),
		sessionSeqIdx: uniqueIndex('agent_chat_messages_session_seq_idx').on(
			table.sessionId,
			table.seq,
		),
	}),
)

export const pointPricingRules = sqliteTable('point_pricing_rules', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	resourceType: text('resource_type', {
		enum: ['llm', 'asr', 'download'],
	}).notNull(),
	pricingMode: text('pricing_mode', {
		enum: ['cost_markup', 'legacy_manual'],
	}),
	// Nullable:
	// - null + null => global default for the resourceType
	// - providerId + null => provider default (LLM/ASR only)
	// - providerId + modelId => model override (LLM/ASR only)
	// Download always uses null providerId/modelId.
	providerId: text('provider_id'),
	modelId: text('model_id'),
	unit: text('unit', { enum: ['token', 'second', 'minute'] }).notNull(),
	pricePerUnit: integer('price_per_unit').notNull(),
	// LLM only: separate prices for input/output tokens. Non-LLM rows keep these null.
	inputPricePerUnit: integer('input_price_per_unit'),
	outputPricePerUnit: integer('output_price_per_unit'),
	minCharge: integer('min_charge'),
	// Cost-based pricing metadata (used by admin tooling to derive the actual price fields).
	// All values are optional to allow legacy/manual rules to coexist.
	// - cost fields are stored in fen to avoid floating-point drift.
	// - markup is stored in bps: 100 bps = 1.00%
	markupBps: integer('markup_bps'),
	costInputFenPer1M: integer('cost_input_fen_per_1m'),
	costOutputFenPer1M: integer('cost_output_fen_per_1m'),
	costFenPerMinute: integer('cost_fen_per_minute'),
	minChargeCostFen: integer('min_charge_cost_fen'),
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
			'render-thread',
			'thread-asset-ingest',
			'channel-sync',
			'asr',
		],
	}).notNull(),
	engine: text('engine', {
		enum: [
			'media-downloader',
			'renderer-remotion',
			'burner-ffmpeg',
			'asr-pipeline',
		],
	}).notNull(),
	targetType: text('target_type', {
		enum: ['media', 'channel', 'thread', 'system'],
	}).notNull(),
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

export const jobEvents = sqliteTable(
	'job_events',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		// Stable unique key for dedupe (e.g. callback:jobId:eventSeq).
		eventKey: text('event_key').notNull(),
		kind: text('kind').notNull(),
		jobId: text('job_id').notNull(),
		taskId: text('task_id'),
		purpose: text('purpose'),
		status: text('status'),
		source: text('source', { enum: ['callback', 'reconciler'] }).notNull(),
		eventSeq: integer('event_seq'),
		eventId: text('event_id'),
		eventTs: integer('event_ts', { mode: 'timestamp' }),
		message: text('message'),
		payload: text('payload'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		eventKeyIdx: uniqueIndex('job_events_event_key_idx').on(table.eventKey),
	}),
)

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
		transcriptionWords: text('transcription_words', { mode: 'json' }).$type<
			TranscriptionWord[]
		>(),
		translation: text('translation'),
		// Explicit job references for cloud renders.
		renderSubtitlesJobId: text('render_subtitles_job_id'),
		renderCommentsJobId: text('render_comments_job_id'),
		// 渲染配置：评论视频 Remotion 模板
		commentsTemplate: text('comments_template'),
		// 渲染配置：评论模板参数（配色/字体/布局等）
		commentsTemplateConfig: text('comments_template_config', {
			mode: 'json',
		}).$type<CommentsTemplateConfig>(),
		comments: text('comments', { mode: 'json' }).$type<Comment[]>(),
		commentsDownloadedAt: integer('comments_downloaded_at', {
			mode: 'timestamp',
		}),
		downloadBackend: text('download_backend', { enum: ['local', 'cloud'] })
			.default('local')
			.notNull(),
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
		remoteAudioSourceKey: text('remote_audio_source_key'),
		remoteAudioProcessedKey: text('remote_audio_processed_key'),
		remoteMetadataKey: text('remote_metadata_key'),
		downloadVideoBytes: integer('download_video_bytes'),
		downloadAudioBytes: integer('download_audio_bytes'),
		downloadQueuedAt: integer('download_queued_at', { mode: 'timestamp' }),
		downloadCompletedAt: integer('download_completed_at', {
			mode: 'timestamp',
		}),
		rawMetadataDownloadedAt: integer('raw_metadata_downloaded_at', {
			mode: 'timestamp',
		}),
	},
	(table) => ({
		userUrlIdx: uniqueIndex('media_user_url_idx').on(table.userId, table.url),
	}),
)

export const threads = sqliteTable(
	'threads',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		userId: text('user_id').notNull(),
		source: text('source', { enum: ['x', 'custom'] })
			.$type<ThreadSource>()
			.notNull(),
		sourceUrl: text('source_url'),
		sourceId: text('source_id'),
		title: text('title').notNull(),
		lang: text('lang'),
		templateId: text('template_id'),
		templateConfig: text('template_config', { mode: 'json' }),
		audioAssetId: text('audio_asset_id'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		userSourceIdIdx: uniqueIndex('threads_user_source_id_idx').on(
			table.userId,
			table.source,
			table.sourceId,
		),
	}),
)

export const threadPosts = sqliteTable(
	'thread_posts',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		threadId: text('thread_id').notNull(),
		sourcePostId: text('source_post_id'),
		role: text('role', { enum: ['root', 'reply'] }).notNull(),
		authorName: text('author_name').notNull(),
		authorHandle: text('author_handle'),
		authorProfileUrl: text('author_profile_url'),
		authorAvatarAssetId: text('author_avatar_asset_id'),
		contentBlocks: text('content_blocks', { mode: 'json' })
			.$type<ThreadContentBlock[]>()
			.notNull(),
		plainText: text('plain_text').notNull(),
		metrics: text('metrics', { mode: 'json' }).$type<ThreadPostMetrics>(),
		depth: integer('depth').notNull().default(0),
		parentSourcePostId: text('parent_source_post_id'),
		raw: text('raw', { mode: 'json' }),
		translations: text('translations', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		editedAt: integer('edited_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		threadSourcePostIdIdx: uniqueIndex(
			'thread_posts_thread_source_post_id_idx',
		).on(table.threadId, table.sourcePostId),
	}),
)

export const threadAssets = sqliteTable('thread_assets', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	userId: text('user_id').notNull(),
	kind: text('kind', {
		enum: ['image', 'video', 'avatar', 'linkPreview', 'audio'],
	}).notNull(),
	sourceUrl: text('source_url'),
	storageKey: text('storage_key'),
	contentType: text('content_type'),
	bytes: integer('bytes'),
	width: integer('width'),
	height: integer('height'),
	durationMs: integer('duration_ms'),
	thumbnailAssetId: text('thumbnail_asset_id'),
	status: text('status', { enum: ['pending', 'ready', 'failed'] })
		.notNull()
		.default('pending'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const threadRenders = sqliteTable('thread_renders', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	threadId: text('thread_id').notNull(),
	userId: text('user_id').notNull(),
	status: text('status', {
		enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
	}).notNull(),
	jobId: text('job_id'),
	templateId: text('template_id'),
	templateConfig: text('template_config', { mode: 'json' }),
	audioAssetId: text('audio_asset_id'),
	inputSnapshotKey: text('input_snapshot_key'),
	outputVideoKey: text('output_video_key'),
	error: text('error'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const threadTemplateLibrary = sqliteTable(
	'thread_template_library',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		userId: text('user_id').notNull(),
		name: text('name').notNull(),
		// Remotion template id (e.g. 'thread-forum')
		templateId: text('template_id').notNull(),
		description: text('description'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		userNameIdx: uniqueIndex('thread_template_library_user_name_idx').on(
			table.userId,
			table.name,
		),
	}),
)

export const threadTemplateVersions = sqliteTable(
	'thread_template_versions',
	{
		id: text('id')
			.unique()
			.notNull()
			.$defaultFn(() => createId()),
		userId: text('user_id').notNull(),
		libraryId: text('library_id').notNull(),
		version: integer('version').notNull(),
		note: text('note'),
		sourceThreadId: text('source_thread_id'),
		// User-provided raw config for editing (must be v1 for now)
		templateConfig: text('template_config', { mode: 'json' }),
		templateConfigHash: text('template_config_hash'),
		compileVersion: integer('compile_version').notNull().default(1),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		libraryVersionIdx: uniqueIndex(
			'thread_template_versions_library_ver_idx',
		).on(table.libraryId, table.version),
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
	protocol: text('protocol', {
		enum: ['http', 'https', 'socks4', 'socks5', 'trojan', 'vless', 'hysteria2'],
	}).notNull(),
	username: text('username'),
	password: text('password'),
	nodeUrl: text('ssr_url').notNull(), // Store original subscription node string (legacy column name)
	lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
	testStatus: text('test_status', {
		enum: ['pending', 'success', 'failed'],
	}).default('pending'),
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

export const proxySettings = sqliteTable('proxy_settings', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => 'default'),
	proxyCheckTestUrl: text('proxy_check_test_url'),
	proxyCheckTimeoutMs: integer('proxy_check_timeout_ms'),
	proxyCheckProbeBytes: integer('proxy_check_probe_bytes'),
	proxyCheckConcurrency: integer('proxy_check_concurrency'),
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
			enum: [
				'openai_compat',
				'deepseek_native',
				'cloudflare_asr',
				'whisper_api',
			],
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
		isDefault: integer('is_default', { mode: 'boolean' })
			.notNull()
			.default(false),
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
