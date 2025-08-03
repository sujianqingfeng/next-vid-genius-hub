import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR } from '~/lib/constants'
import { db, schema } from '~/lib/db'
import { renderVideoWithSubtitles } from '~/lib/media'

const renderHandler = os
	.input(
		z.object({
			mediaId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const where = eq(schema.media.id, input.mediaId)
		const media = await db.query.media.findFirst({
			where,
		})

		if (!media) {
			throw new Error('Media not found')
		}

		if (!media.translation) {
			throw new Error('Translation not found')
		}

		if (!media.filePath) {
			throw new Error('Media file path not found')
		}

		const operationDir = path.join(OPERATIONS_DIR, media.id)
		await fs.mkdir(operationDir, { recursive: true })

		const subtitlePath = path.join(operationDir, 'subtitles.vtt')
		await fs.writeFile(subtitlePath, media.translation)

		const originalFilePath = media.filePath
		const outputPath = path.join(operationDir, 'rendered.mp4')

		await renderVideoWithSubtitles(originalFilePath, subtitlePath, outputPath)

		await db.update(schema.media).set({ renderedPath: outputPath }).where(where)

		return {
			message: 'Rendering started',
		}
	})

export const render = {
	render: renderHandler,
}
