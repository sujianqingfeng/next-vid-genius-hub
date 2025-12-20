import { os } from '@orpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { getDb, schema } from '~/lib/db'

export const listByTarget = os
	.input(
		z.object({
			targetType: z.enum(['media', 'channel', 'system']),
			targetId: z.string().min(1),
			limit: z.number().min(1).max(100).default(50),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const items = await db.query.tasks.findMany({
			where: and(
				eq(schema.tasks.userId, userId),
				eq(schema.tasks.targetId, input.targetId),
				eq(schema.tasks.targetType, input.targetType),
			),
			orderBy: desc(schema.tasks.createdAt),
			limit: input.limit,
			offset: input.offset,
		})
		return { items }
	})

export const getById = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const task = await db.query.tasks.findFirst({
			where: and(
				eq(schema.tasks.id, input.id),
				eq(schema.tasks.userId, userId),
			),
		})
		return task
	})

export const listRecent = os
	.input(
		z.object({
			limit: z.number().min(1).max(100).default(50),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const items = await db.query.tasks.findMany({
			where: eq(schema.tasks.userId, userId),
			orderBy: desc(schema.tasks.createdAt),
			limit: input.limit,
			offset: input.offset,
		})
		return { items }
	})
