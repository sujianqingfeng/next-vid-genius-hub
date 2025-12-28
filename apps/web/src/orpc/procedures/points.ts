import { os } from '@orpc/server'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { throwInsufficientPointsError } from '~/lib/orpc/errors'
import {
	getBalance,
	InsufficientPointsError,
	listTransactions,
	spendPoints,
} from '~/lib/points/service'

const ListSchema = z.object({
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
})

const SpendSchema = z.object({
	amount: z.number().int().positive(),
	refType: z.string().optional(),
	refId: z.string().optional(),
	remark: z.string().optional(),
})

export const getMyBalance = os.handler(async ({ context }) => {
	const ctx = context as RequestContext
	const balance = await getBalance(ctx.auth.user!.id)
	return { balance }
})

export const listMyTransactions = os
	.input(ListSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const items = await listTransactions({
			userId: ctx.auth.user!.id,
			limit: input.limit,
			offset: input.offset,
		})
		return { items }
	})

export const spendForTask = os
	.input(SpendSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		try {
			const balance = await spendPoints({
				userId: ctx.auth.user!.id,
				amount: input.amount,
				type: 'task_cost',
				refType: input.refType ?? 'task',
				refId: input.refId ?? null,
				remark: input.remark ?? '任务扣费',
			})
			return { balance }
		} catch (error) {
			if (error instanceof InsufficientPointsError) {
				throwInsufficientPointsError()
			}
			throw error
		}
	})
