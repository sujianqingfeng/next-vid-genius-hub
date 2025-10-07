import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR } from '~/lib/config/app.config'
import { db, schema } from '~/lib/db'

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

export const deleteById = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input
		await db.delete(schema.media).where(eq(schema.media.id, id))
		const operationDir = path.join(OPERATIONS_DIR, id)
		await fs.rm(operationDir, { recursive: true, force: true })
		return { success: true }
	})
