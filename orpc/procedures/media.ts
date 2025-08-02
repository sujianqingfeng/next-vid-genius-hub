import { os } from '@orpc/server'
import { z } from 'zod'
import { db, schema } from '~/lib/db'

// Procedure: media
// Returns paginated list of media items.
export const media = os
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
