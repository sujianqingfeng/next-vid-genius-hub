import { createRouterClient } from '@orpc/server'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { setInjectedD1Database } from '~/lib/db'
import { appRouter } from '~/orpc/router'
import {
	applyMinimalAuthSchema,
	applyMinimalThreadsSchema,
	applyThreadTemplateLibrarySchema,
	createTempD1Database,
	type D1Database,
} from '~/lib/db/__tests__/d1-test-helper'

describe('orpc.threadTemplate', () => {
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
		await applyMinimalThreadsSchema(d1)
		await applyThreadTemplateLibrarySchema(d1)
	})

	afterAll(async () => {
		setInjectedD1Database(undefined)
		if (closeDb) await closeDb()
	})

	it('creates template, versions, applies to thread, deletes library', async () => {
		if (!d1) throw new Error('test db not initialized')
		const now = Date.now()
		const threadId = `thr_${now}`

		await d1.exec(
			`INSERT INTO threads (id, user_id, source, title, created_at, updated_at) VALUES ('${threadId}', '${userId}', 'custom', 't', ${now}, ${now});`,
		)

		const v1 = {
			version: 1,
			typography: { fontPreset: 'noto', fontScale: 1 },
			scenes: {
				cover: { root: { type: 'Text', text: 'Hello', size: 28, weight: 700 } },
				post: {
					root: {
						type: 'Text',
						bind: 'root.plainText',
						size: 28,
						weight: 700,
					},
				},
			},
		}

		const created = await orpc.threadTemplate.create({
			name: `Test ${now}`,
			templateId: 'thread-forum',
			templateConfig: v1,
			note: 'v1',
		})

		expect(created.libraryId).toBeTruthy()
		expect(created.version).toBe(1)
		expect(created.templateConfigHash).toBeTruthy()
		expect(typeof created.compileVersion).toBe('number')

		const v2 = {
			...v1,
			scenes: {
				...v1.scenes,
				cover: {
					root: { type: 'Text', text: 'Hello v2', size: 30, weight: 700 },
				},
			},
		}

		const v2Added = await orpc.threadTemplate.addVersion({
			libraryId: String(created.libraryId),
			templateConfig: v2,
			note: 'v2',
		})
		expect(v2Added.version).toBe(2)

		const versions = await orpc.threadTemplate.versions({
			libraryId: String(created.libraryId),
			limit: 50,
		})
		expect(versions.versions.length).toBeGreaterThanOrEqual(2)
		const latest = versions.versions[0] as any
		expect(latest.version).toBe(2)

		await orpc.threadTemplate.applyToThread({
			threadId,
			versionId: String(latest.id),
		})

		const row = await d1
			.prepare(
				`SELECT template_id as templateId, template_config as templateConfig FROM threads WHERE id=? AND user_id=?`,
			)
			.bind(threadId, userId)
			.first()

		expect((row as any)?.templateId).toBe('thread-forum')
		expect(
			JSON.parse(String((row as any)?.templateConfig)).scenes.cover.root.text,
		).toBe('Hello v2')

		await orpc.threadTemplate.deleteById({
			libraryId: String(created.libraryId),
		})
		const list = await orpc.threadTemplate.list()
		expect(
			(list.libraries as any[]).find((x) => x.id === created.libraryId),
		).toBe(undefined)
	})

	it('applyToThread throws when thread not found', async () => {
		const now = Date.now()
		const v1 = {
			version: 1,
			typography: { fontPreset: 'noto', fontScale: 1 },
			scenes: {
				cover: { root: { type: 'Text', text: 'Hello', size: 28, weight: 700 } },
				post: { root: { type: 'Text', text: 'x', size: 28, weight: 700 } },
			},
		}

		const created = await orpc.threadTemplate.create({
			name: `Test missing thread ${now}`,
			templateId: 'thread-forum',
			templateConfig: v1,
		})

		const versions = await orpc.threadTemplate.versions({
			libraryId: String(created.libraryId),
			limit: 10,
		})
		const latest = versions.versions[0] as any

		await expect(
			orpc.threadTemplate.applyToThread({
				threadId: `missing_${now}`,
				versionId: String(latest.id),
			}),
		).rejects.toThrow(/Thread not found/)
	})
})
