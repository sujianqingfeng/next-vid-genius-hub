import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import type { PointTransactionType } from '~/lib/db/schema'
import { logger } from '~/lib/logger'
import { createId } from '~/lib/utils/id'

type DbClient = Awaited<ReturnType<typeof getDb>>

export class InsufficientPointsError extends Error {
	constructor() {
		super('积分不足')
		this.name = 'InsufficientPointsError'
	}
}

async function ensureAccount(db: DbClient, userId: string) {
	const existing = await db.query.pointAccounts.findFirst({
		where: eq(schema.pointAccounts.userId, userId),
	})
	if (existing) return existing
	const [account] = await db
		.insert(schema.pointAccounts)
		.values({
			id: createId(),
			userId,
			balance: 0,
			frozenBalance: 0,
		})
		.returning()
	return account
}

export async function getBalance(userId: string, db?: DbClient) {
	const client = db ?? (await getDb())
	const account = await client.query.pointAccounts.findFirst({
		where: eq(schema.pointAccounts.userId, userId),
	})
	return account?.balance ?? 0
}

export async function addPoints(opts: {
	userId: string
	amount: number
	type: PointTransactionType
	refType?: string | null
	refId?: string | null
	remark?: string | null
	metadata?: Record<string, unknown> | null
	db?: DbClient
}) {
	if (opts.amount <= 0) throw new Error('amount must be positive')
	const client = opts.db ?? (await getDb())
	const now = new Date()

	const applyChange = async (tx: DbClient) => {
		const account = await ensureAccount(tx, opts.userId)
		const newBalance = account.balance + opts.amount

		await tx
			.update(schema.pointAccounts)
			.set({ balance: newBalance, updatedAt: now })
			.where(eq(schema.pointAccounts.userId, opts.userId))

		await tx.insert(schema.pointTransactions).values({
			userId: opts.userId,
			delta: opts.amount,
			balanceAfter: newBalance,
			type: opts.type,
			refType: opts.refType ?? null,
			refId: opts.refId ?? null,
			remark: opts.remark ?? null,
			metadata: opts.metadata ?? null,
			createdAt: now,
		})

		logger.info(
			'api',
			`[points.add] user=${opts.userId} delta=${opts.amount} type=${opts.type} balance=${newBalance} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
		)

		return newBalance
	}

	if (opts.db) {
		return applyChange(client)
	}

	return applyChange(client)
}

export async function spendPoints(opts: {
	userId: string
	amount: number
	type: PointTransactionType
	refType?: string | null
	refId?: string | null
	remark?: string | null
	metadata?: Record<string, unknown> | null
	db?: DbClient
}) {
	if (opts.amount <= 0) throw new Error('amount must be positive')
	const client = opts.db ?? (await getDb())
	const now = new Date()

	const applyChange = async (tx: DbClient) => {
		const account = await ensureAccount(tx, opts.userId)
		const newBalance = account.balance - opts.amount
		if (newBalance < 0) {
			logger.warn(
				'api',
				`[points.spend] insufficient user=${opts.userId} delta=${opts.amount} balance=${account.balance} type=${opts.type} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
			)
			throw new InsufficientPointsError()
		}

		await tx
			.update(schema.pointAccounts)
			.set({ balance: newBalance, updatedAt: now })
			.where(eq(schema.pointAccounts.userId, opts.userId))

		await tx.insert(schema.pointTransactions).values({
			userId: opts.userId,
			delta: -opts.amount,
			balanceAfter: newBalance,
			type: opts.type,
			refType: opts.refType ?? null,
			refId: opts.refId ?? null,
			remark: opts.remark ?? null,
			metadata: opts.metadata ?? null,
			createdAt: now,
		})

		logger.info(
			'api',
			`[points.spend] user=${opts.userId} delta=-${opts.amount} type=${opts.type} balance=${newBalance} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
		)

		return newBalance
	}

	if (opts.db) {
		return applyChange(client)
	}

	return applyChange(client)
}

export async function listTransactions(opts: {
	userId: string
	limit?: number
	offset?: number
	db?: DbClient
}) {
	const client = opts.db ?? (await getDb())
	const items = await client.query.pointTransactions.findMany({
		where: eq(schema.pointTransactions.userId, opts.userId),
		orderBy: desc(schema.pointTransactions.createdAt),
		limit: opts.limit ?? 50,
		offset: opts.offset ?? 0,
	})
	return items
}

export async function listTransactionsByRef(opts: {
	userId: string
	refId: string
	limit?: number
	offset?: number
	db?: DbClient
}) {
	const client = opts.db ?? (await getDb())
	const items = await client.query.pointTransactions.findMany({
		where: and(
			eq(schema.pointTransactions.userId, opts.userId),
			eq(schema.pointTransactions.refId, opts.refId),
		),
		orderBy: desc(schema.pointTransactions.createdAt),
		limit: opts.limit ?? 50,
		offset: opts.offset ?? 0,
	})
	return items
}

export async function summarizeTransactionsByRef(opts: {
	userId: string
	refId: string
	db?: DbClient
}) {
	const client = opts.db ?? (await getDb())
	const [row] = await client
		.select({
			total: sql<number>`count(*)`,
			netDelta: sql<number>`coalesce(sum(${schema.pointTransactions.delta}), 0)`,
		})
		.from(schema.pointTransactions)
		.where(
			and(
				eq(schema.pointTransactions.userId, opts.userId),
				eq(schema.pointTransactions.refId, opts.refId),
			),
		)

	return {
		total: Number(row?.total ?? 0),
		netDelta: Number(row?.netDelta ?? 0),
	}
}
