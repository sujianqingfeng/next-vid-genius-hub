import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setInjectedD1Database } from '~/lib/infra/db'
import {
	createTempD1Database,
	execStatements,
} from '~/lib/infra/db/__tests__/d1-test-helper'
import {
	addPoints,
	InsufficientPointsError,
	spendPoints,
	spendPointsOnce,
} from '../service'

describe('points service (D1)', () => {
	let cleanup: (() => Promise<void>) | null = null
	let d1: Awaited<ReturnType<typeof createTempD1Database>>['d1'] | null = null

	beforeEach(async () => {
		const db = await createTempD1Database()
		d1 = db.d1
		cleanup = db.cleanup
		setInjectedD1Database(db.d1)

		await execStatements(db.d1, [
			[
				`CREATE TABLE IF NOT EXISTS point_accounts (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  balance INTEGER DEFAULT 0 NOT NULL,`,
				`  frozen_balance INTEGER DEFAULT 0 NOT NULL,`,
				`  updated_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
			`CREATE UNIQUE INDEX IF NOT EXISTS point_accounts_id_unique ON point_accounts (id);`,
			`CREATE UNIQUE INDEX IF NOT EXISTS point_accounts_user_id_unique ON point_accounts (user_id);`,
			[
				`CREATE TABLE IF NOT EXISTS point_transactions (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  delta INTEGER NOT NULL,`,
				`  balance_after INTEGER NOT NULL,`,
				`  type TEXT NOT NULL,`,
				`  ref_type TEXT,`,
				`  ref_id TEXT,`,
				`  remark TEXT,`,
				`  metadata TEXT,`,
				`  created_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
			`CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_id_unique ON point_transactions (id);`,
		])
	})

	afterEach(async () => {
		setInjectedD1Database(undefined)
		if (cleanup) await cleanup()
		cleanup = null
		d1 = null
	})

	it('adds and spends points', async () => {
		const userId = 'u1'
		await addPoints({
			userId,
			amount: 100,
			type: 'manual_adjust',
			remark: 'seed',
		})

		const balance = await spendPoints({
			userId,
			amount: 30,
			type: 'task_cost',
			refType: 'task',
			refId: 't1',
		})

		expect(balance).toBe(70)

		const row: any = await d1!
			.prepare(`SELECT balance FROM point_accounts WHERE user_id = ?`)
			.bind(userId)
			.first()
		expect(Number(row?.balance ?? 0)).toBe(70)
	})

	it('throws when insufficient', async () => {
		const userId = 'u1'
		await addPoints({ userId, amount: 10, type: 'manual_adjust' })

		await expect(
			spendPoints({ userId, amount: 20, type: 'task_cost', refId: 't2' }),
		).rejects.toBeInstanceOf(InsufficientPointsError)
	})

	it('spendPointsOnce is idempotent by refId', async () => {
		const userId = 'u1'
		await addPoints({ userId, amount: 100, type: 'manual_adjust' })

		const first = await spendPointsOnce({
			userId,
			amount: 40,
			type: 'asr_usage',
			refType: 'asr',
			refId: 'job-1',
		})
		expect(first).toEqual({ charged: 40, balance: 60 })

		const second = await spendPointsOnce({
			userId,
			amount: 40,
			type: 'asr_usage',
			refType: 'asr',
			refId: 'job-1',
		})
		expect(second).toEqual({ charged: 0 })

		const balanceRow: any = await d1!
			.prepare(`SELECT balance FROM point_accounts WHERE user_id = ?`)
			.bind(userId)
			.first()
		expect(Number(balanceRow?.balance ?? 0)).toBe(60)

		const txRow: any = await d1!
			.prepare(
				[
					`SELECT count(*) as cnt`,
					`FROM point_transactions`,
					`WHERE user_id = ? AND type = ? AND ref_id = ?`,
				].join(' '),
			)
			.bind(userId, 'asr_usage', 'job-1')
			.first()
		expect(Number(txRow?.cnt ?? 0)).toBe(1)
	})

	it('spendPointsOnce throws when insufficient and not charged', async () => {
		const userId = 'u1'
		await addPoints({ userId, amount: 10, type: 'manual_adjust' })

		await expect(
			spendPointsOnce({
				userId,
				amount: 20,
				type: 'download_usage',
				refType: 'download',
				refId: 'job-2',
			}),
		).rejects.toBeInstanceOf(InsufficientPointsError)
	})
})
