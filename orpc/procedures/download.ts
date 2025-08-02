import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/constants'
import { db, schema } from '~/lib/db'
import { extractAudio } from '~/lib/media'
import { downloadVideo, extractVideoId, getYouTubeClient } from '~/lib/youtube'

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
		let downloadRecord = await db.query.media.findFirst({
			where: eq(schema.media.url, url),
		})

		const isNewDownload = !downloadRecord
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

		let info // Will be fetched if needed

		if (!videoExists) {
			const videoId = extractVideoId(url) ?? url
			const yt = await getYouTubeClient({
				proxy: PROXY_URL,
			})
			info = await yt.getBasicInfo(videoId)
			await downloadVideo(url, quality, videoPath)
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
		if (!info && !downloadRecord) {
			const videoId = extractVideoId(url) ?? url
			const yt = await getYouTubeClient({
				proxy: PROXY_URL,
			})
			info = await yt.getBasicInfo(videoId)
		}

		// 4. Upsert database record
		const data = {
			title: info?.basic_info.title ?? downloadRecord?.title ?? 'video',
			author: info?.basic_info.author ?? downloadRecord?.author ?? '',
			thumbnail:
				info?.basic_info.thumbnail?.[0]?.url ?? downloadRecord?.thumbnail ?? '',
			viewCount: info?.basic_info.view_count ?? downloadRecord?.viewCount ?? 0,
			likeCount: info?.basic_info.like_count ?? downloadRecord?.likeCount ?? 0,
			filePath: videoPath,
			audioFilePath: audioPath,
			quality,
		}

		await db
			.insert(schema.media)
			.values({
				id,
				url,
				source: 'youtube',
				...data,
			})
			.onConflictDoUpdate({
				target: schema.media.url,
				set: data,
			})

		// 5. Return result
		const title = info?.basic_info?.title ?? downloadRecord?.title ?? 'video'
		return {
			id,
			videoPath,
			audioPath,
			title,
		}
	})
