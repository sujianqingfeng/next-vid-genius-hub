import { createRouterClient } from '@orpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setInjectedD1Database } from '~/lib/db'
import { appRouter } from '~/orpc/router'
import {
	applyMinimalAiSchema,
	applyMinimalAuthSchema,
	createTempD1Database,
	type D1Database,
} from '~/lib/db/__tests__/d1-test-helper'

describe('orpc.ai', () => {
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
		await applyMinimalAiSchema(d1)
	})

	afterAll(async () => {
		setInjectedD1Database(undefined)
		if (closeDb) await closeDb()
	})

	it('getDefaultModel does not leak provider secrets', async () => {
		if (!d1) throw new Error('test db not initialized')

		const now = Date.now()
		await d1.exec(
			[
				`INSERT INTO ai_providers (id, slug, name, kind, type, base_url, api_key, enabled, metadata, created_at, updated_at)`,
				`VALUES ('prov_1', 'openai', 'OpenAI', 'llm', 'openai_compat', 'https://example.com', 'SECRET', 1, NULL, ${now}, ${now});`,
			].join(' '),
		)
		await d1.exec(
			[
				`INSERT INTO ai_models (id, provider_id, kind, remote_model_id, label, description, enabled, is_default, capabilities, created_at, updated_at)`,
				`VALUES ('llm_1', 'prov_1', 'llm', 'gpt-test', 'Test LLM', NULL, 1, 1, NULL, ${now}, ${now});`,
			].join(' '),
		)

		const res = await orpc.ai.getDefaultModel({ kind: 'llm' })
		expect(res.model?.id).toBe('llm_1')
		expect((res.model as any)?.provider).toBe(undefined)
		expect(JSON.stringify(res.model ?? {})).not.toContain('SECRET')
	})
})

