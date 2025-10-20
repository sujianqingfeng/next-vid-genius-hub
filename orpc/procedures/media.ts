import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR } from '~/lib/config/app.config'
import { deleteCloudArtifacts } from '~/lib/cloudflare'
import { db, schema } from '~/lib/db'
import { logger } from '~/lib/logger'

export const list = os
	.input(
		z.object({
			page: z.number().min(1).optional().default(1),
			limit: z.number().min(1).max(100).optional().default(9),
		}),
	)
	.handler(async ({ input }) => {
		const { page = 1, limit = 9 } = input
		const offset = (page - 1) * limit

		// Fetch paginated items with stable ordering
		const items = await db
			.select()
			.from(schema.media)
			.orderBy(desc(schema.media.createdAt))
			.limit(limit)
			.offset(offset)

		// Get total count for pagination efficiently
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.media)

		return {
			items,
			total: Number(count ?? 0),
			page,
			limit,
		}
	})

export const byId = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input
		const item = await db.query.media.findFirst({
			where: eq(schema.media.id, id),
		})
		return item
	})

export const updateTitles = os
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			translatedTitle: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const { id, title, translatedTitle } = input

		const updateData: Record<string, string | undefined> = {}
		if (title !== undefined) updateData.title = title
		if (translatedTitle !== undefined) updateData.translatedTitle = translatedTitle

		await db.update(schema.media).set(updateData).where(eq(schema.media.id, id))

		const updated = await db.query.media.findFirst({
			where: eq(schema.media.id, id),
		})

		return updated
	})

export const deleteById = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input

		// 1) Load record to gather cloud references (best-effort)
		const record = await db.query.media.findFirst({ where: eq(schema.media.id, id) })

		// 2) Best-effort cloud cleanup (remote keys + orchestrator artifacts)
		try {
			if (record) {
				const keys: string[] = []
				// Directly referenced remote objects from the record
				if (record.remoteVideoKey) keys.push(record.remoteVideoKey)
				if (record.remoteAudioKey) keys.push(record.remoteAudioKey)
				if (record.remoteMetadataKey) keys.push(record.remoteMetadataKey)
				// Well-known per-media objects that we materialize into the bucket
				keys.push(
					`manifests/media/${id}.json`,
					`inputs/subtitles/${id}.vtt`,
					`inputs/videos/subtitles/${id}.mp4`,
					`inputs/comments/${id}.json`,
				)

				const artifactJobIds: string[] = []
				// videoWithSubtitlesPath or videoWithInfoPath might store remote orchestrator artifact refs: "remote:orchestrator:<jobId>"
				for (const p of [record.videoWithSubtitlesPath, record.videoWithInfoPath, record.filePath]) {
					if (typeof p === 'string' && p.startsWith('remote:orchestrator:')) {
						const jobId = p.split(':').pop()
						if (jobId) artifactJobIds.push(jobId)
					}
				}
				// Also include the cloud download job id (if any)
				if (record.downloadJobId) artifactJobIds.push(record.downloadJobId)

				// Known per-media prefixes that may contain multiple artifacts
				const prefixes = [
					`outputs/by-media/${id}/`,
					`downloads/${id}/`,
					`asr/results/by-media/${id}/`,
				]

				await deleteCloudArtifacts({ keys, artifactJobIds, prefixes })
			}
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('media', `[media.deleteById] cloud cleanup failed (continuing): ${msg}`)
    }

		// 3) Delete DB record
		await db.delete(schema.media).where(eq(schema.media.id, id))

		// 4) Remove local operation directory
		const operationDir = path.join(OPERATIONS_DIR, id)
		await fs.rm(operationDir, { recursive: true, force: true })

		return { success: true }
	})
