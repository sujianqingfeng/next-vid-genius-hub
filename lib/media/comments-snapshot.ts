import { putObjectByKey } from '~/lib/cloudflare'
import { schema } from '~/lib/db'
import type { Comment } from '~/lib/db/schema'
import type { VideoInfo } from '~/lib/media/types'
import { bucketPaths } from '@app/media-domain'

const COMMENTS_SERIES_TITLE = '外网真实评论'

type MediaRecord = typeof schema.media.$inferSelect

interface BuildCommentsSnapshotOptions {
	comments: Comment[]
	translatedTitle?: string | null
}

interface BuildCommentsSnapshotResult {
	key: string
	videoInfo: VideoInfo
}

/**
 * Persist the latest comments snapshot to object storage and update the media manifest.
 * Consumers provide the current media record alongside the comment list (and optional translated title override).
 */
export async function buildCommentsSnapshot(
	media: MediaRecord,
	options: BuildCommentsSnapshotOptions,
): Promise<BuildCommentsSnapshotResult> {
	const key = bucketPaths.inputs.comments(media.id, { title: media.title || undefined })

	const translatedTitle = (options.translatedTitle ?? media.translatedTitle) || undefined

	const videoInfo: VideoInfo = {
		title: media.title || 'Untitled',
		translatedTitle,
		viewCount: media.viewCount ?? 0,
		author: media.author || undefined,
		thumbnail: media.thumbnail || undefined,
		series: COMMENTS_SERIES_TITLE,
	}

	await putObjectByKey(key, 'application/json', JSON.stringify({ videoInfo, comments: options.comments }))

	return { key, videoInfo }
}
