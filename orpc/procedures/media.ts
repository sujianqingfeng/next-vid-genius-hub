import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '~/lib/db'

const list = os
	.input(
		z.object({
			page: z.number().min(1).optional().default(1),
			limit: z.number().min(1).max(100).optional().default(9),
		}),
	)
	.handler(async ({ input }) => {
		const { page = 1, limit = 9 } = input
		const offset = (page - 1) * limit

		// Fetch paginated items
		const items = await db
			.select()
			.from(schema.media)
			.limit(limit)
			.offset(offset)

		// Get total count for pagination
		const allRows = await db.query.media.findMany()
		const total = allRows.length

		return {
			items,
			total,
			page,
			limit,
		}
	})

const byId = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input
		const item = await db.query.media.findFirst({
			where: eq(schema.media.id, id),
		})
		return item
	})

export const media = {
	list,
	byId,
}
