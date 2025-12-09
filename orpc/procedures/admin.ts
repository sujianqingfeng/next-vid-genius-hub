import { os } from '@orpc/server'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '~/lib/db'
import type { RequestContext } from '~/lib/auth/types'

function ensureAdmin(context: RequestContext) {
	const user = context.auth.user
	if (!user || user.role !== 'admin') {
		throw new Error('FORBIDDEN')
	}
	return user
}

const ListUsersSchema = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
	q: z.string().trim().optional(),
})

export const listUsers = os
	.input(ListUsersSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		ensureAdmin(ctx)
		const db = await getDb()

		const page = input.page ?? 1
		const limit = input.limit ?? 20
		const offset = (page - 1) * limit

		const filters = []
		if (input.q && input.q.length > 0) {
			const keyword = `%${input.q}%`
			filters.push(
				or(
					like(schema.users.email, keyword),
					like(schema.users.nickname, keyword),
					like(schema.users.id, keyword),
				),
			)
		}

		const whereClause =
			filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined

		const totalRows = await db
			.select({ value: count() })
			.from(schema.users)
			.where(whereClause)

		const users = await db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				nickname: schema.users.nickname,
				role: schema.users.role,
				status: schema.users.status,
				createdAt: schema.users.createdAt,
				lastLoginAt: schema.users.lastLoginAt,
			})
			.from(schema.users)
			.where(whereClause)
			.orderBy(desc(schema.users.createdAt))
			.limit(limit)
			.offset(offset)

		const total = totalRows?.[0]?.value ?? 0
		const pageCount = Math.ceil(total / limit) || 1

		return {
			items: users,
			total,
			page,
			pageCount,
		}
	})

const UpdateUserRoleSchema = z.object({
	userId: z.string().min(1),
	role: z.enum(['user', 'admin']),
})

export const updateUserRole = os
	.input(UpdateUserRoleSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		ensureAdmin(ctx)
		const db = await getDb()

		await db
			.update(schema.users)
			.set({
				role: input.role,
				updatedAt: new Date(),
			})
			.where(eq(schema.users.id, input.userId))

		return { success: true }
	})

const UpdateUserStatusSchema = z.object({
	userId: z.string().min(1),
	status: z.enum(['active', 'banned']),
})

export const updateUserStatus = os
	.input(UpdateUserStatusSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		ensureAdmin(ctx)
		const db = await getDb()

		await db
			.update(schema.users)
			.set({
				status: input.status,
				updatedAt: new Date(),
			})
			.where(eq(schema.users.id, input.userId))

		return { success: true }
	})
