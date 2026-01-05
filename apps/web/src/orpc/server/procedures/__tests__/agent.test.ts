import { createRouterClient } from '@orpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setInjectedD1Database } from '~/lib/infra/db'
import { appRouter } from '~/orpc/server/router'
import {
	applyMinimalAgentChatSchema,
	applyMinimalAuthSchema,
	createTempD1Database,
	type D1Database,
} from '~/lib/infra/db/__tests__/d1-test-helper'

describe('orpc.agent', () => {
	let closeDb: (() => any) | null = null
	let d1: D1Database | null = null

	const userId = 'user_test_1'

	const orpc = createRouterClient(appRouter, {
		context: async () => ({
			auth: {
				user: {
					id: userId,
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
	}) as any

	beforeAll(async () => {
		const temp = await createTempD1Database()
		d1 = temp.d1
		closeDb = temp.cleanup
		setInjectedD1Database(d1 as any)
		await applyMinimalAuthSchema(d1)
		await applyMinimalAgentChatSchema(d1)
	})

	afterAll(async () => {
		setInjectedD1Database(undefined)
		if (closeDb) await closeDb()
	})

	it('creates session, syncs messages, renames, deletes', async () => {
		if (!d1) throw new Error('test db not initialized')

		const created = await orpc.agent.createSession({})
		expect(created.session.id).toBeTruthy()

		const list1 = await orpc.agent.listSessions({ limit: 50 })
		expect(list1.items.length).toBe(1)

		const sessionId = String(created.session.id)
		const messages = [
			{
				id: 'm1',
				role: 'user',
				parts: [{ type: 'text', text: 'hello agent' }],
				createdAt: new Date().toISOString(),
			},
			{
				id: 'm2',
				role: 'assistant',
				parts: [{ type: 'text', text: 'hi' }],
				createdAt: new Date().toISOString(),
			},
		]

		await orpc.agent.syncMessages({
			sessionId,
			messages,
			modelId: 'llm_test_1',
		})

		const loaded = await orpc.agent.getSession({ sessionId })
		expect(loaded.session.id).toBe(sessionId)
		expect(loaded.messages.length).toBe(2)
		expect((loaded.messages[0] as any)?.id).toBe('m1')

		await orpc.agent.renameSession({ sessionId, title: 'My chat' })
		const list2 = await orpc.agent.listSessions({ limit: 50 })
		expect(list2.items[0]?.title).toBe('My chat')

		await orpc.agent.deleteSession({ sessionId })
		const list3 = await orpc.agent.listSessions({ limit: 50 })
		expect(list3.items.length).toBe(0)

		await expect(orpc.agent.getSession({ sessionId })).rejects.toBeTruthy()
	})

	it('dedupes createSession when sessionId is reused', async () => {
		if (!d1) throw new Error('test db not initialized')

		const sessionId = 'session_idempotent_1'
		const a = await orpc.agent.createSession({ sessionId })
		const b = await orpc.agent.createSession({ sessionId })

		expect(a.session.id).toBe(sessionId)
		expect(b.session.id).toBe(sessionId)

		const list = await orpc.agent.listSessions({ limit: 50 })
		expect(list.items.filter((s: any) => s.id === sessionId).length).toBe(1)
	})
})
