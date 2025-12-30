import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type D1BoundStatement = {
	all: () => Promise<{ results: unknown[] }>
	raw: () => Promise<unknown[][]>
	first: () => Promise<unknown>
	run: () => Promise<unknown>
}

export type D1PreparedStatement = {
	bind: (...args: unknown[]) => D1BoundStatement
}

export type D1Database = {
	exec: (sql: string) => Promise<unknown>
	prepare: (sql: string) => D1PreparedStatement
}

export function createD1FromLibsql(dbFileUrl: string): {
	d1: D1Database
	close: () => Promise<void>
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

	return { d1, close: async () => await client.close() }
}

export async function createTempD1Database(): Promise<{
	d1: D1Database
	cleanup: () => Promise<void>
	dbFileUrl: string
}> {
	const dir = await mkdtemp(join(tmpdir(), 'vidgen-d1-test-'))
	const dbFileUrl = `file:${join(dir, 'db.sqlite')}`

	const { d1, close } = createD1FromLibsql(dbFileUrl)
	const cleanup = async () => {
		await close()
		await rm(dir, { recursive: true, force: true })
	}

	return { d1, cleanup, dbFileUrl }
}

export async function execStatements(d1: D1Database, statements: string[]) {
	for (const sql of statements) {
		await d1.exec(sql)
	}
}

export async function applyMinimalAuthSchema(d1: D1Database) {
	await execStatements(d1, [
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
	])
}

export async function applyMinimalThreadsSchema(d1: D1Database) {
	await execStatements(d1, [
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
	])
}

export async function applyThreadTemplateLibrarySchema(d1: D1Database) {
	await execStatements(d1, [
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
	])
}
