import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { setInjectedD1Database } from '~/lib/db'
import { getDb, schema } from '~/lib/db'
import {
	applyMinimalAuthSchema,
	createTempD1Database,
	type D1Database,
} from '~/lib/db/__tests__/d1-test-helper'

vi.mock('~/lib/auth/context', () => {
	return {
		buildRequestContext: async () => ({
			auth: {
				user: {
					id: 'user_test_1',
					email: 'test@example.com',
					passwordHash: 'x',
					nickname: 'test',
					role: 'user',
					status: 'active',
					lastLoginAt: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				session: null,
			},
			responseCookies: [],
		}),
	}
})

const startCloudDownloadMock = vi.fn(async () => {
	return { mediaId: 'media_1', jobId: 'job_1', taskId: 'task_1' }
})

vi.mock('~/lib/media/server/download', () => {
	return {
		startCloudDownload: (...args: any[]) => startCloudDownloadMock(...args),
		getCloudDownloadStatus: async () => ({ status: 'completed', progress: 1 }),
	}
})

describe('agent actions', () => {
	let closeDb: (() => any) | null = null
	let d1: D1Database | null = null

	beforeAll(async () => {
		const temp = await createTempD1Database()
		d1 = temp.d1
		closeDb = temp.cleanup
		setInjectedD1Database(d1 as any)
		await applyMinimalAuthSchema(d1)

		await d1.exec(
			[
				`CREATE TABLE IF NOT EXISTS agent_actions (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  kind TEXT NOT NULL,`,
				`  status TEXT NOT NULL DEFAULT 'proposed',`,
				`  params TEXT,`,
				`  estimate TEXT,`,
				`  result TEXT,`,
				`  error TEXT,`,
				`  confirmed_at INTEGER,`,
				`  completed_at INTEGER,`,
				`  created_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
		)
	})

	afterAll(async () => {
		setInjectedD1Database(undefined)
		if (closeDb) await closeDb()
	})

	it('confirm is idempotent after completion', async () => {
		startCloudDownloadMock.mockClear()
		const db = await getDb()
		await db.insert(schema.agentActions).values({
			id: 'action_1',
			userId: 'user_test_1',
			kind: 'download',
			status: 'proposed',
			params: {
				url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
				quality: '1080p',
			},
			estimate: { unknown: true },
			createdAt: new Date(),
		})

		const { handleAgentActionConfirmRequest } =
			await import('~/lib/ai/server/agent-actions')

		const req1 = new Request('http://local/api/agent/actions/confirm', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ actionId: 'action_1' }),
		})
		const res1 = await handleAgentActionConfirmRequest(req1)
		expect(res1.status).toBe(200)
		const json1 = await res1.json()
		expect(json1.action?.id).toBe('action_1')

		const req2 = new Request('http://local/api/agent/actions/confirm', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ actionId: 'action_1' }),
		})
		const res2 = await handleAgentActionConfirmRequest(req2)
		expect(res2.status).toBe(200)
		const json2 = await res2.json()
		expect(json2.action?.id).toBe('action_1')

		expect(startCloudDownloadMock).toHaveBeenCalledTimes(1)
	})

	it('cancel only affects proposed actions', async () => {
		const db = await getDb()
		await db.insert(schema.agentActions).values({
			id: 'action_2',
			userId: 'user_test_1',
			kind: 'download',
			status: 'completed',
			params: {
				url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
				quality: '1080p',
			},
			createdAt: new Date(),
		})

		const { handleAgentActionCancelRequest } =
			await import('~/lib/ai/server/agent-actions')

		const req = new Request('http://local/api/agent/actions/cancel', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ actionId: 'action_2' }),
		})
		const res = await handleAgentActionCancelRequest(req)
		expect(res.status).toBe(200)
		const json = await res.json()
		expect(json.action?.status).toBe('completed')
	})
})
