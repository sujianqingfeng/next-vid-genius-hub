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

export const media = sqliteTable('media', {
	id: text('id')
		.unique()
		.notNull()
		.$defaultFn(() => createId()),
	title: text('title').notNull(),
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
	translation: text('translation'),
	renderedPath: text('rendered_path'),
	comments: text('comments', { mode: 'json' }).$type<Comment[]>(),
})
