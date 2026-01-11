import { and, desc, eq, sql } from 'drizzle-orm'
import {
	getDb,
	getInjectedD1DatabaseBinding,
	hasInjectedD1DatabaseBinding,
	schema,
} from '~/lib/infra/db'
import type { PointTransactionType } from '~/lib/infra/db/schema'
import { logger } from '~/lib/infra/logger'
import { createId } from '~/lib/shared/utils/id'

type DbClient = Awaited<ReturnType<typeof getDb>>

export class InsufficientPointsError extends Error {
	constructor() {
		super('INSUFFICIENT_POINTS')
		this.name = 'InsufficientPointsError'
	}
}

function toSqlTimestampSeconds(value: Date): number {
	return Math.trunc(value.getTime() / 1000)
}

async function runD1BatchOrFallback(d1: any, statements: any[]) {
	if (typeof d1.batch === 'function') {
		await d1.batch(statements)
		return
	}
	for (const stmt of statements) {
		await stmt.run()
	}
}

function getChanges(result: unknown): number | null {
	const res: any = result
	const changes =
		typeof res?.meta?.changes === 'number'
			? res.meta.changes
			: typeof res?.changes === 'number'
				? res.changes
				: typeof res?.rowsAffected === 'number'
					? res.rowsAffected
					: null
	return typeof changes === 'number' ? changes : null
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
	const now = new Date()
	const nowTs = toSqlTimestampSeconds(now)

	if (hasInjectedD1DatabaseBinding()) {
		const d1 = getInjectedD1DatabaseBinding()
		if (!d1) throw new Error('D1_BINDING_MISSING')

		const txId = createId()
		const metadataJson = opts.metadata ? JSON.stringify(opts.metadata) : null

		const statements = [
			d1
				.prepare(
					[
						`INSERT OR IGNORE INTO point_accounts`,
						`(id, user_id, balance, frozen_balance, updated_at)`,
						`VALUES (?, ?, 0, 0, ?)`,
					].join(' '),
				)
				.bind(createId(), opts.userId, nowTs),
			d1
				.prepare(
					[
						`UPDATE point_accounts`,
						`SET balance = balance + ?, updated_at = ?`,
						`WHERE user_id = ?`,
					].join(' '),
				)
				.bind(opts.amount, nowTs, opts.userId),
			d1
				.prepare(
					[
						`INSERT INTO point_transactions`,
						`(id, user_id, delta, balance_after, type, ref_type, ref_id, remark, metadata, created_at)`,
						`SELECT ?, ?, ?, balance, ?, ?, ?, ?, ?, ?`,
						`FROM point_accounts`,
						`WHERE user_id = ? AND changes() = 1`,
					].join(' '),
				)
				.bind(
					txId,
					opts.userId,
					opts.amount,
					opts.type,
					opts.refType ?? null,
					opts.refId ?? null,
					opts.remark ?? null,
					metadataJson,
					nowTs,
					opts.userId,
				),
		]

		await runD1BatchOrFallback(d1, statements)

		const txRow: any = await d1
			.prepare(`SELECT balance_after FROM point_transactions WHERE id = ?`)
			.bind(txId)
			.first()
		if (!txRow) {
			throw new Error('Failed to record points transaction')
		}
		const newBalance = Number(txRow.balance_after ?? 0)
		if (!Number.isFinite(newBalance)) {
			throw new Error('Failed to read new points balance')
		}

		logger.info(
			'api',
			`[points.add] user=${opts.userId} delta=${opts.amount} type=${opts.type} balance=${newBalance} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
		)

		return newBalance
	}

	const client = opts.db ?? (await getDb())

	return await client.transaction(async (tx) => {
		await tx
			.insert(schema.pointAccounts)
			.values({
				id: createId(),
				userId: opts.userId,
				balance: 0,
				frozenBalance: 0,
				updatedAt: now,
			})
			.onConflictDoNothing()

		const updateRes: any = await tx
			.update(schema.pointAccounts)
			.set({
				balance: sql`${schema.pointAccounts.balance} + ${opts.amount}`,
				updatedAt: now,
			})
			.where(eq(schema.pointAccounts.userId, opts.userId))

		const changes = getChanges(updateRes)
		if (typeof changes === 'number' && changes <= 0) {
			throw new Error('Failed to update points balance')
		}

		const account = await tx.query.pointAccounts.findFirst({
			where: eq(schema.pointAccounts.userId, opts.userId),
		})
		if (!account) throw new Error('Point account not found')

		const newBalance = account.balance
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
	})
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
	const now = new Date()
	const nowTs = toSqlTimestampSeconds(now)

	if (hasInjectedD1DatabaseBinding()) {
		const d1 = getInjectedD1DatabaseBinding()
		if (!d1) throw new Error('D1_BINDING_MISSING')

		const txId = createId()
		const metadataJson = opts.metadata ? JSON.stringify(opts.metadata) : null

		const statements = [
			d1
				.prepare(
					[
						`INSERT OR IGNORE INTO point_accounts`,
						`(id, user_id, balance, frozen_balance, updated_at)`,
						`VALUES (?, ?, 0, 0, ?)`,
					].join(' '),
				)
				.bind(createId(), opts.userId, nowTs),
			d1
				.prepare(
					[
						`UPDATE point_accounts`,
						`SET balance = balance - ?, updated_at = ?`,
						`WHERE user_id = ? AND balance >= ?`,
					].join(' '),
				)
				.bind(opts.amount, nowTs, opts.userId, opts.amount),
			d1
				.prepare(
					[
						`INSERT INTO point_transactions`,
						`(id, user_id, delta, balance_after, type, ref_type, ref_id, remark, metadata, created_at)`,
						`SELECT ?, ?, ?, balance, ?, ?, ?, ?, ?, ?`,
						`FROM point_accounts`,
						`WHERE user_id = ? AND changes() = 1`,
					].join(' '),
				)
				.bind(
					txId,
					opts.userId,
					-opts.amount,
					opts.type,
					opts.refType ?? null,
					opts.refId ?? null,
					opts.remark ?? null,
					metadataJson,
					nowTs,
					opts.userId,
				),
		]

		await runD1BatchOrFallback(d1, statements)

		const txRow: any = await d1
			.prepare(`SELECT balance_after FROM point_transactions WHERE id = ?`)
			.bind(txId)
			.first()
		if (!txRow) {
			const accountRow: any = await d1
				.prepare(`SELECT balance FROM point_accounts WHERE user_id = ?`)
				.bind(opts.userId)
				.first()
			const balance = Number(accountRow?.balance ?? 0)
			logger.warn(
				'api',
				`[points.spend] insufficient user=${opts.userId} delta=${opts.amount} balance=${Number.isFinite(balance) ? balance : 0} type=${opts.type} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
			)
			throw new InsufficientPointsError()
		}

		const newBalance = Number(txRow.balance_after ?? 0)
		if (!Number.isFinite(newBalance)) {
			throw new Error('Failed to read new points balance')
		}

		logger.info(
			'api',
			`[points.spend] user=${opts.userId} delta=-${opts.amount} type=${opts.type} balance=${newBalance} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
		)

		return newBalance
	}

	const client = opts.db ?? (await getDb())

	return await client.transaction(async (tx) => {
		await tx
			.insert(schema.pointAccounts)
			.values({
				id: createId(),
				userId: opts.userId,
				balance: 0,
				frozenBalance: 0,
				updatedAt: now,
			})
			.onConflictDoNothing()

		const updateRes: any = await tx
			.update(schema.pointAccounts)
			.set({
				balance: sql`${schema.pointAccounts.balance} - ${opts.amount}`,
				updatedAt: now,
			})
			.where(
				and(
					eq(schema.pointAccounts.userId, opts.userId),
					sql`${schema.pointAccounts.balance} >= ${opts.amount}`,
				),
			)

		const changes = getChanges(updateRes)
		if (typeof changes === 'number' && changes <= 0) {
			const account = await tx.query.pointAccounts.findFirst({
				where: eq(schema.pointAccounts.userId, opts.userId),
			})
			logger.warn(
				'api',
				`[points.spend] insufficient user=${opts.userId} delta=${opts.amount} balance=${account?.balance ?? 0} type=${opts.type} refType=${opts.refType ?? 'null'} refId=${opts.refId ?? 'null'}`,
			)
			throw new InsufficientPointsError()
		}

		const account = await tx.query.pointAccounts.findFirst({
			where: eq(schema.pointAccounts.userId, opts.userId),
		})
		if (!account) throw new Error('Point account not found')

		const newBalance = account.balance
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
	})
}

export async function spendPointsOnce(opts: {
	userId: string
	amount: number
	type: PointTransactionType
	refType?: string | null
	refId: string
	remark?: string | null
	metadata?: Record<string, unknown> | null
	db?: DbClient
}): Promise<{ charged: number; balance?: number }> {
	if (opts.amount <= 0) throw new Error('amount must be positive')
	const refId = opts.refId.trim()
	if (!refId) {
		const balance = await spendPoints({
			userId: opts.userId,
			amount: opts.amount,
			type: opts.type,
			refType: opts.refType ?? null,
			refId: null,
			remark: opts.remark ?? null,
			metadata: opts.metadata ?? null,
			db: opts.db,
		})
		return { charged: opts.amount, balance }
	}

	const now = new Date()
	const nowTs = toSqlTimestampSeconds(now)

	if (hasInjectedD1DatabaseBinding()) {
		const d1 = getInjectedD1DatabaseBinding()
		if (!d1) throw new Error('D1_BINDING_MISSING')

		const txId = createId()
		const metadataJson = opts.metadata ? JSON.stringify(opts.metadata) : null

		const statements = [
			d1
				.prepare(
					[
						`INSERT OR IGNORE INTO point_accounts`,
						`(id, user_id, balance, frozen_balance, updated_at)`,
						`VALUES (?, ?, 0, 0, ?)`,
					].join(' '),
				)
				.bind(createId(), opts.userId, nowTs),
			d1
				.prepare(
					[
						`UPDATE point_accounts`,
						`SET balance = balance - ?, updated_at = ?`,
						`WHERE user_id = ? AND balance >= ?`,
						`AND NOT EXISTS (`,
						`  SELECT 1 FROM point_transactions`,
						`  WHERE user_id = ? AND type = ? AND ref_id = ?`,
						`)`,
					].join(' '),
				)
				.bind(
					opts.amount,
					nowTs,
					opts.userId,
					opts.amount,
					opts.userId,
					opts.type,
					refId,
				),
			d1
				.prepare(
					[
						`INSERT INTO point_transactions`,
						`(id, user_id, delta, balance_after, type, ref_type, ref_id, remark, metadata, created_at)`,
						`SELECT ?, ?, ?, balance, ?, ?, ?, ?, ?, ?`,
						`FROM point_accounts`,
						`WHERE user_id = ? AND changes() = 1`,
					].join(' '),
				)
				.bind(
					txId,
					opts.userId,
					-opts.amount,
					opts.type,
					opts.refType ?? null,
					refId,
					opts.remark ?? null,
					metadataJson,
					nowTs,
					opts.userId,
				),
		]

		await runD1BatchOrFallback(d1, statements)

		const txRow: any = await d1
			.prepare(`SELECT balance_after FROM point_transactions WHERE id = ?`)
			.bind(txId)
			.first()
		if (txRow) {
			const balance = Number(txRow.balance_after ?? 0)
			if (!Number.isFinite(balance)) {
				throw new Error('Failed to read new points balance')
			}
			logger.info(
				'api',
				`[points.spend] user=${opts.userId} delta=-${opts.amount} type=${opts.type} balance=${balance} refType=${opts.refType ?? 'null'} refId=${refId}`,
			)
			return { charged: opts.amount, balance }
		}

		const existing: any = await d1
			.prepare(
				[
					`SELECT 1 as ok`,
					`FROM point_transactions`,
					`WHERE user_id = ? AND type = ? AND ref_id = ?`,
					`LIMIT 1`,
				].join(' '),
			)
			.bind(opts.userId, opts.type, refId)
			.first()
		if (existing) return { charged: 0 }

		const accountRow: any = await d1
			.prepare(`SELECT balance FROM point_accounts WHERE user_id = ?`)
			.bind(opts.userId)
			.first()
		const balance = Number(accountRow?.balance ?? 0)
		logger.warn(
			'api',
			`[points.spend] insufficient user=${opts.userId} delta=${opts.amount} balance=${Number.isFinite(balance) ? balance : 0} type=${opts.type} refType=${opts.refType ?? 'null'} refId=${refId}`,
		)
		throw new InsufficientPointsError()
	}

	const client = opts.db ?? (await getDb())

	return await client.transaction(async (tx) => {
		await tx
			.insert(schema.pointAccounts)
			.values({
				id: createId(),
				userId: opts.userId,
				balance: 0,
				frozenBalance: 0,
				updatedAt: now,
			})
			.onConflictDoNothing()

		const updateRes: any = await tx
			.update(schema.pointAccounts)
			.set({
				balance: sql`${schema.pointAccounts.balance} - ${opts.amount}`,
				updatedAt: now,
			})
			.where(
				and(
					eq(schema.pointAccounts.userId, opts.userId),
					sql`${schema.pointAccounts.balance} >= ${opts.amount}`,
					sql`not exists (
						select 1 from point_transactions
						where user_id = ${opts.userId}
							and type = ${opts.type}
							and ref_id = ${refId}
						limit 1
					)`,
				),
			)

		const changes = getChanges(updateRes)
		if (typeof changes === 'number' && changes <= 0) {
			const existing = await tx.query.pointTransactions.findFirst({
				where: and(
					eq(schema.pointTransactions.userId, opts.userId),
					eq(schema.pointTransactions.type, opts.type),
					eq(schema.pointTransactions.refId, refId),
				),
			})
			if (existing) return { charged: 0 }

			const account = await tx.query.pointAccounts.findFirst({
				where: eq(schema.pointAccounts.userId, opts.userId),
			})
			logger.warn(
				'api',
				`[points.spend] insufficient user=${opts.userId} delta=${opts.amount} balance=${account?.balance ?? 0} type=${opts.type} refType=${opts.refType ?? 'null'} refId=${refId}`,
			)
			throw new InsufficientPointsError()
		}

		const account = await tx.query.pointAccounts.findFirst({
			where: eq(schema.pointAccounts.userId, opts.userId),
		})
		if (!account) throw new Error('Point account not found')

		const balance = account.balance
		await tx.insert(schema.pointTransactions).values({
			userId: opts.userId,
			delta: -opts.amount,
			balanceAfter: balance,
			type: opts.type,
			refType: opts.refType ?? null,
			refId,
			remark: opts.remark ?? null,
			metadata: opts.metadata ?? null,
			createdAt: now,
		})

		logger.info(
			'api',
			`[points.spend] user=${opts.userId} delta=-${opts.amount} type=${opts.type} balance=${balance} refType=${opts.refType ?? 'null'} refId=${refId}`,
		)

		return { charged: opts.amount, balance }
	})
}

export async function hasTransactionForRef(opts: {
	userId: string
	type: PointTransactionType
	refId: string
	db?: DbClient
}): Promise<boolean> {
	const client = opts.db ?? (await getDb())
	const refId = opts.refId.trim()
	if (!refId) return false
	const row = await client.query.pointTransactions.findFirst({
		where: and(
			eq(schema.pointTransactions.userId, opts.userId),
			eq(schema.pointTransactions.type, opts.type),
			eq(schema.pointTransactions.refId, refId),
		),
	})
	return Boolean(row)
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
