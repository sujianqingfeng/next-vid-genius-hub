import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/constants'
import { db, schema, createMediaUpdateData } from '~/lib/db'
import { extractAudio } from '~/lib/media'
import { resolveVideoProvider, providerToSource } from '~/lib/media/providers'
import type { VideoProviderContext } from '~/lib/media/providers'
import type { BasicVideoInfo, MediaSource } from '~/lib/media/providers/types'
import { downloadVideo } from '~/lib/youtube'
import { fileExists } from '~/lib/utils/file-utils'

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
		const videoExists = await fileExists(videoPath)

		const provider = resolveVideoProvider(url)
		const providerContext: VideoProviderContext = {
			proxyUrl: PROXY_URL,
		}

		let metadata: BasicVideoInfo | null | undefined

		if (!videoExists) {
			metadata = await provider.fetchMetadata(url, providerContext)
			await downloadVideo(url, quality, videoPath)
		}

		// 3. Check for audio file and extract if missing
		const audioExists = await fileExists(audioPath)
		if (!audioExists) {
			await extractAudio(videoPath, audioPath)
		}

		// Ensure we have video info if it's a new record
		if (!downloadRecord && !metadata) {
			metadata = await provider.fetchMetadata(url, providerContext)
		}

		// 4. Upsert database record
		const source: MediaSource = metadata?.source ?? providerToSource(provider.id)
		const data = createMediaUpdateData({
			metadata,
			downloadRecord,
			videoPath,
			audioPath,
			quality,
		})

		await db
			.insert(schema.media)
			.values({
				id,
				url,
				source,
				...data,
			})
			.onConflictDoUpdate({
				target: schema.media.url,
				set: data,
			})

		// 5. Return result
		const title = metadata?.title ?? downloadRecord?.title ?? 'video'
		return {
			id,
			videoPath,
			audioPath,
			title,
		}
	})
