import { createId } from '@paralleldrive/cuid2'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
	transcription: text('transcription'),
	transcriptionWords: text('transcription_words', { mode: 'json' }).$type<TranscriptionWord[]>(),
	translation: text('translation'),
	videoWithSubtitlesPath: text('video_with_subtitles_path'),
	videoWithInfoPath: text('video_with_info_path'),
	comments: text('comments', { mode: 'json' }).$type<Comment[]>(),
	commentsDownloadedAt: integer('comments_downloaded_at', { mode: 'timestamp' }),
})

export const ssrSubscriptions = sqliteTable('ssr_subscriptions', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	name: text('name').notNull(),
	url: text('url').notNull(),
	isActive: integer('is_active', { mode: 'boolean' }).default(false),
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
	protocol: text('protocol', { enum: ['http', 'https', 'socks4', 'socks5'] }).notNull(),
	username: text('username'),
	password: text('password'),
	ssrUrl: text('ssr_url').notNull(), // Store original SSR URL
	isActive: integer('is_active', { mode: 'boolean' }).default(false),
	lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
	testStatus: text('test_status', { enum: ['pending', 'success', 'failed'] }).default('pending'),
	responseTime: integer('response_time'), // in milliseconds
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
})
