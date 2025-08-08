import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/constants'
import { db, schema } from '~/lib/db'
import { extractAudio } from '~/lib/media'
import { getTikTokInfo, pickTikTokThumbnail } from '~/lib/tiktok'
import { downloadVideo, extractVideoId, getYouTubeClient } from '~/lib/youtube'

function isTikTokUrl(url: string): boolean {
	try {
		const u = new URL(url)
		const h = u.hostname.toLowerCase()
		return (
			h.includes('tiktok.com') ||
			h.includes('douyin.com') ||
			h.includes('iesdouyin.com')
		)
	} catch {
		return false
	}
}

export const download = os
	.input(
		z.object({
			url: z.string().url(),
			quality: z.enum(['1080p', '720p']).optional().default('1080p'),
		}),
	)
	.handler(async ({ input }) => {
		const { url, quality } = input

		// 1. Find existing download or prepare a new one
		const downloadRecord = await db.query.media.findFirst({
			where: eq(schema.media.url, url),
		})

		const id = downloadRecord?.id ?? createId()
		const operationDir = path.join(OPERATIONS_DIR, id)
		await fs.mkdir(operationDir, { recursive: true })

		const videoPath =
			downloadRecord?.filePath ?? path.join(operationDir, `${id}.mp4`)
		const audioPath =
			downloadRecord?.audioFilePath ?? path.join(operationDir, `${id}.mp3`)

		// 2. Check for video file and download if missing
		const videoExists = await fs
			.access(videoPath)
			.then(() => true)
			.catch(() => false)

		// youtubei.js types are complex; we only read a subset of fields
		type YtBasicInfo = {
			basic_info: {
				title?: string
				author?: string
				thumbnail?: Array<{ url?: string }>
				view_count?: number
				like_count?: number
			}
		}
		let ytInfo: YtBasicInfo | undefined
		let tkInfo: import('~/lib/tiktok').TikTokInfo | null | undefined

		if (!videoExists) {
			if (isTikTokUrl(url)) {
				// Fetch TikTok info via yt-dlp JSON
				tkInfo = await getTikTokInfo(url)
				await downloadVideo(url, quality, videoPath)
			} else {
				const videoId = extractVideoId(url) ?? url
				const yt = await getYouTubeClient({
					proxy: PROXY_URL,
				})
				ytInfo = await yt.getBasicInfo(videoId)
				await downloadVideo(url, quality, videoPath)
			}
		}

		// 3. Check for audio file and extract if missing
		const audioExists = await fs
			.access(audioPath)
			.then(() => true)
			.catch(() => false)
		if (!audioExists) {
			await extractAudio(videoPath, audioPath)
		}

		// Ensure we have video info if it's a new record
		if (!downloadRecord) {
			if (isTikTokUrl(url)) {
				tkInfo = tkInfo ?? (await getTikTokInfo(url))
			} else {
				const videoId = extractVideoId(url) ?? url
				const yt = await getYouTubeClient({
					proxy: PROXY_URL,
				})
				ytInfo = ytInfo ?? (await yt.getBasicInfo(videoId))
			}
		}

		// 4. Upsert database record
		const isTik = isTikTokUrl(url)
		const data = {
			title:
				(isTik ? tkInfo?.title : ytInfo?.basic_info.title) ??
				downloadRecord?.title ??
				'video',
			author:
				(isTik
					? tkInfo?.uploader || tkInfo?.uploader_id
					: ytInfo?.basic_info.author) ??
				downloadRecord?.author ??
				'',
			thumbnail:
				(isTik
					? pickTikTokThumbnail(tkInfo ?? null)
					: ytInfo?.basic_info.thumbnail?.[0]?.url) ??
				downloadRecord?.thumbnail ??
				'',
			viewCount:
				(isTik ? tkInfo?.view_count : ytInfo?.basic_info.view_count) ??
				downloadRecord?.viewCount ??
				0,
			likeCount:
				(isTik ? tkInfo?.like_count : ytInfo?.basic_info.like_count) ??
				downloadRecord?.likeCount ??
				0,
			filePath: videoPath,
			audioFilePath: audioPath,
			quality,
		}

		await db
			.insert(schema.media)
			.values({
				id,
				url,
				source: isTik ? 'tiktok' : 'youtube',
				...data,
			})
			.onConflictDoUpdate({
				target: schema.media.url,
				set: data,
			})

		// 5. Return result
		const title =
			(isTik ? tkInfo?.title : ytInfo?.basic_info?.title) ??
			downloadRecord?.title ??
			'video'
		return {
			id,
			videoPath,
			audioPath,
			title,
		}
	})
