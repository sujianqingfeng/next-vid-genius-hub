import { createId } from '@paralleldrive/cuid2'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const media = sqliteTable('media', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	title: text('title').notNull(),
	translatedTitle: text('translated_title'),
	author: text('author'),
	source: text('source', { enum: ['youtube', 'tiktok'] }).notNull(),
	quality: text('quality', { enum: ['720p', '1080p'] }).notNull(),
	thumbnail: text('thumbnail'),
	viewCount: integer('view_count').default(0),
	likeCount: integer('like_count').default(0),
	commentCount: integer('comment_count').default(0),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	url: text('url').notNull().unique(),
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
    commentsModerationSummary: text('comments_moderation_summary', { mode: 'json' }).$type<Record<string, number>>(),
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
})

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

// ---------------- Channels & Channel Videos ----------------
export const channels = sqliteTable('channels', {
  id: text('id')
    .unique()
    .notNull()
    .$defaultFn(() => createId()),
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
