
'use server'

import { createId } from '@paralleldrive/cuid2'
import type { Innertube } from 'youtubei.js'
import { downloadVideo as coreDownloadVideo } from '@app/media-node'
import { sleep } from '~/lib/utils/time'

export async function downloadVideo(
    url: string,
    quality: '1080p' | '720p',
    outputPath: string,
): Promise<void> {
    await coreDownloadVideo(url, quality, outputPath)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapYoutubeComment = (item: any) => {
	// The actual comment data can be nested inside a 'comment' property
	const comment = item.comment || item
	return {
		id: comment.id || createId(),
		content: comment.content?.text ?? '',
		author: comment.author?.name ?? '',
		likes: Number(comment.like_count || 0),
		authorThumbnail: comment.author?.thumbnails?.[0]?.url ?? '',
		replyCount: comment.reply_count ?? 0,
		translatedContent: '', // Placeholder
	}
}

export async function downloadYoutubeComments(
	youtube: Innertube,
	videoId: string,
	pageCount: number,
) {
	const youtubeComments = await youtube.getComments(videoId)

	if (!youtubeComments.contents || youtubeComments.contents.length === 0) {
		return []
	}

	let comments = youtubeComments.contents.map(mapYoutubeComment)
	let currentPage = 1
	let continuation = youtubeComments

	while (continuation.has_continuation && currentPage < pageCount) {
		await sleep(1000)
		const nextPage = await continuation.getContinuation()
		if (nextPage && nextPage.contents) {
			comments = comments.concat(nextPage.contents.map(mapYoutubeComment))
			continuation = nextPage
			currentPage++
		} else {
			break
		}
	}
	return comments
}
