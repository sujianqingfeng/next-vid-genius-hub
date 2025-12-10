import { os } from '@orpc/server'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '~/lib/db'
import { addPoints, listTransactions } from '~/lib/points/service'
import { ADMIN_USERS_PAGE_SIZE, DEFAULT_PAGE_LIMIT } from '~/lib/pagination'
import type { PointResourceType } from '~/lib/db/schema'
import { POINT_TRANSACTION_TYPES } from '~/lib/job/task'

const ListUsersSchema = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(ADMIN_USERS_PAGE_SIZE),
	q: z.string().trim().optional(),
})

export const listUsers = os
	.input(ListUsersSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const page = input.page ?? 1
		const limit = input.limit ?? ADMIN_USERS_PAGE_SIZE
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
	.handler(async ({ input }) => {
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
	.handler(async ({ input }) => {
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

const AddPointsSchema = z.object({
	userId: z.string().min(1),
	amount: z.number().int().positive(),
	remark: z.string().max(200).optional(),
})

export const addUserPoints = os
	.input(AddPointsSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const balance = await addPoints({
			userId: input.userId,
			amount: input.amount,
			type: POINT_TRANSACTION_TYPES.MANUAL_ADJUST,
			remark: input.remark ?? '管理员加分',
			db,
		})

		return { balance }
	})

const ListUserTransactionsSchema = z.object({
	userId: z.string().min(1),
	limit: z.number().int().min(1).max(100).default(DEFAULT_PAGE_LIMIT),
	offset: z.number().int().min(0).default(0),
})

export const listUserTransactions = os
	.input(ListUserTransactionsSchema)
	.handler(async ({ input }) => {
		const items = await listTransactions({
			userId: input.userId,
			limit: input.limit,
			offset: input.offset,
		})
		return { items }
	})

const ListPricingRulesSchema = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(DEFAULT_PAGE_LIMIT),
	resourceType: z.custom<PointResourceType>().optional(),
})

export const listPricingRules = os
	.input(ListPricingRulesSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const page = input.page ?? 1
		const limit = input.limit ?? DEFAULT_PAGE_LIMIT
		const offset = (page - 1) * limit

		const filters = []
		if (input.resourceType) {
			filters.push(eq(schema.pointPricingRules.resourceType, input.resourceType))
		}

		const whereClause =
			filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined

		const totalRows = await db
			.select({ value: count() })
			.from(schema.pointPricingRules)
			.where(whereClause)

		const items = await db
			.select()
			.from(schema.pointPricingRules)
			.where(whereClause)
			.orderBy(desc(schema.pointPricingRules.createdAt))
			.limit(limit)
			.offset(offset)

		const total = totalRows?.[0]?.value ?? 0
		const pageCount = Math.ceil(total / limit) || 1

		return {
			items,
			total,
			page,
			pageCount,
		}
	})

const UpsertPricingRuleSchema = z.object({
	id: z.string().min(1).optional(),
	resourceType: z.custom<PointResourceType>(),
	modelId: z.string().trim().max(200).optional().nullable(),
	unit: z.enum(['token', 'second', 'minute']),
	pricePerUnit: z.number().int().min(0),
	minCharge: z.number().int().min(0).optional().nullable(),
})

export const upsertPricingRule = os
	.input(UpsertPricingRuleSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const now = new Date()

		if (input.id) {
			await db
				.update(schema.pointPricingRules)
				.set({
					resourceType: input.resourceType,
					modelId: input.modelId ?? null,
					unit: input.unit,
					pricePerUnit: input.pricePerUnit,
					minCharge: input.minCharge ?? null,
					updatedAt: now,
				})
				.where(eq(schema.pointPricingRules.id, input.id))
			return { success: true }
		}

		await db.insert(schema.pointPricingRules).values({
			resourceType: input.resourceType,
			modelId: input.modelId ?? null,
			unit: input.unit,
			pricePerUnit: input.pricePerUnit,
			minCharge: input.minCharge ?? null,
			createdAt: now,
			updatedAt: now,
		})

		return { success: true }
	})

const DeletePricingRuleSchema = z.object({
	id: z.string().min(1),
})

export const deletePricingRule = os
	.input(DeletePricingRuleSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		await db
			.delete(schema.pointPricingRules)
			.where(eq(schema.pointPricingRules.id, input.id))

		return { success: true }
	})
