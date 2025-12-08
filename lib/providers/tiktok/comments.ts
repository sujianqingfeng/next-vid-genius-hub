'use server'

import { downloadTikTokCommentsByUrl as coreDownloadTikTokCommentsByUrl } from '@app/media-providers'
import type { TikTokBasicComment } from './types'

/**
 * Thin adapter over the shared `@app/media-providers` TikTok comments downloader.
 * Keeps the public signature local (TikTokBasicComment) while delegating all
 * TikWM / network details to the package layer so we don't duplicate logic.
 */
export async function downloadTikTokCommentsByUrl(
	videoUrl: string,
	pages: number = 3,
): Promise<TikTokBasicComment[]> {
	const comments = await coreDownloadTikTokCommentsByUrl({ url: videoUrl, pages })

	return comments.map((c) => ({
		id: c.id,
		author: c.author,
		authorThumbnail: c.authorThumbnail,
		content: c.content,
		likes: c.likes,
		replyCount: c.replyCount,
	}))
}
