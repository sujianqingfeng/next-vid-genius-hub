import type { Innertube } from 'youtubei.js'
import YTDlpWrap from 'yt-dlp-wrap'
import { createId } from '@paralleldrive/cuid2'

export async function downloadVideo(
	url: string,
	quality: '1080p' | '720p',
	outputPath: string,
): Promise<void> {
	const ytdlp = new YTDlpWrap()
	await ytdlp.execPromise([
		url,
		'-f',
		quality === '1080p'
			? 'bestvideo[height<=1080]+bestaudio/best'
			: 'bestvideo[height<=720]+bestaudio/best',
		'--merge-output-format',
		'mp4',
		'-o',
		outputPath,
	])
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
