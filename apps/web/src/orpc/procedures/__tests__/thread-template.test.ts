import { createRouterClient } from '@orpc/server'
import { createClient } from '@libsql/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { setInjectedD1Database } from '~/lib/db'
import { appRouter } from '~/orpc/router'

type D1BoundStatement = {
	all: () => Promise<{ results: unknown[] }>
	raw: () => Promise<unknown[][]>
	first: () => Promise<unknown>
	run: () => Promise<unknown>
}

type D1PreparedStatement = {
	bind: (...args: unknown[]) => D1BoundStatement
}

type D1Database = {
	exec: (sql: string) => Promise<unknown>
	prepare: (sql: string) => D1PreparedStatement
}

function createD1FromLibsql(dbFileUrl: string): {
	d1: D1Database
	close: () => any
} {
	const client = createClient({ url: dbFileUrl })

	const d1: D1Database = {
		exec: async (sql) => {
			return await client.execute(sql)
		},
		prepare: (sql) => {
			return {
				bind: (...args: unknown[]) => {
					return {
						all: async () => {
							const res = await client.execute({ sql, args })
							return { results: res.rows as any[] }
						},
						raw: async () => {
							const res = await client.execute({ sql, args })
							return res.rows.map((r: any) => res.columns.map((c) => r?.[c]))
						},
						first: async () => {
							const res = await client.execute({ sql, args })
							return res.rows[0] ?? null
						},
						run: async () => {
							return await client.execute({ sql, args })
						},
					}
				},
			}
		},
	}

	return { d1, close: () => client.close() }
}

describe('orpc.threadTemplate', () => {
	let closeDb: (() => any) | null = null
	let dbUrl = ''

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
		const { mkdtemp, rm } = await import('node:fs/promises')
		const { tmpdir } = await import('node:os')
		const { join } = await import('node:path')

		const dir = await mkdtemp(join(tmpdir(), 'vidgen-thread-template-test-'))
		dbUrl = `file:${join(dir, 'db.sqlite')}`

		const { d1, close } = createD1FromLibsql(dbUrl)
		closeDb = async () => {
			await close()
			await rm(dir, { recursive: true, force: true })
		}

		setInjectedD1Database(d1 as any)

		// Minimal schema required for getDb() schema readiness and this suite.
		const statements = [
			[
				`CREATE TABLE IF NOT EXISTS users (`,
				`  id TEXT NOT NULL,`,
				`  email TEXT NOT NULL,`,
				`  password_hash TEXT NOT NULL,`,
				`  nickname TEXT,`,
				`  role TEXT NOT NULL DEFAULT 'user',`,
				`  status TEXT NOT NULL DEFAULT 'active',`,
				`  last_login_at INTEGER,`,
				`  created_at INTEGER NOT NULL,`,
				`  updated_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
			[
				`CREATE TABLE IF NOT EXISTS sessions (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  token_hash TEXT NOT NULL,`,
				`  expires_at INTEGER NOT NULL,`,
				`  created_at INTEGER NOT NULL,`,
				`  revoked_at INTEGER`,
				`);`,
			].join('\n'),
			[
				`CREATE TABLE IF NOT EXISTS threads (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  source TEXT NOT NULL,`,
				`  source_url TEXT,`,
				`  source_id TEXT,`,
				`  title TEXT NOT NULL,`,
				`  lang TEXT,`,
				`  template_id TEXT,`,
				`  template_config TEXT,`,
				`  audio_asset_id TEXT,`,
				`  created_at INTEGER NOT NULL,`,
				`  updated_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
			[
				`CREATE TABLE IF NOT EXISTS thread_template_library (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  name TEXT NOT NULL,`,
				`  template_id TEXT NOT NULL,`,
				`  description TEXT,`,
				`  created_at INTEGER NOT NULL,`,
				`  updated_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
			[
				`CREATE TABLE IF NOT EXISTS thread_template_versions (`,
				`  id TEXT NOT NULL,`,
				`  user_id TEXT NOT NULL,`,
				`  library_id TEXT NOT NULL,`,
				`  version INTEGER NOT NULL,`,
				`  note TEXT,`,
				`  source_thread_id TEXT,`,
				`  template_config TEXT,`,
				`  template_config_resolved TEXT,`,
				`  template_config_hash TEXT,`,
				`  compile_version INTEGER NOT NULL DEFAULT 1,`,
				`  created_at INTEGER NOT NULL`,
				`);`,
			].join('\n'),
		]

		for (const sql of statements) {
			await d1.exec(sql)
		}
	})

	afterAll(async () => {
		setInjectedD1Database(undefined)
		if (closeDb) await closeDb()
	})

	it('creates template, versions, applies to thread, deletes library', async () => {
		const now = Date.now()
		const threadId = `thr_${now}`

		const d1 = (globalThis as any).__VIDGEN_D1_DB__ as D1Database
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
