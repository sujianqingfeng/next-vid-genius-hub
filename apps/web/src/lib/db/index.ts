import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql'
import * as schema from './schema'

// Prefer Cloudflare D1 when available (wrangler dev / Worker runtime)
// Fallback to libsql (file/turso) when no CF binding is present.
type D1PreparedStatement = {
	bind: (...args: unknown[]) => {
		first: () => Promise<unknown>
		run: () => Promise<unknown>
	}
}

type D1Database = {
	exec: (sql: string) => Promise<unknown>
	prepare: (sql: string) => D1PreparedStatement
}
type DbClient = ReturnType<typeof drizzleD1<typeof schema>>

type DbGlobals = {
	__VIDGEN_D1_DB__?: D1Database
}

function getLimitOffsetPlaceholderIndices(sql: string): number[] {
	const indices: number[] = []

	const addMatches = (re: RegExp) => {
		re.lastIndex = 0
		let match: RegExpExecArray | null
		while ((match = re.exec(sql))) {
			const text = match[0]
			const qPos = match.index + text.lastIndexOf('?')
			// Placeholder index is the count of '?' up to (and including) qPos - 1
			let placeholderIndex = -1
			for (let i = 0; i <= qPos; i++) {
				if (sql[i] === '?') placeholderIndex++
			}
			if (placeholderIndex >= 0) indices.push(placeholderIndex)
		}
	}

	addMatches(/\blimit\s+\?/gi)
	addMatches(/\boffset\s+\?/gi)

	return Array.from(new Set(indices)).sort((a, b) => b - a)
}

function replaceNthPlaceholder(
	sql: string,
	placeholderIndex: number,
	replacement: string,
) {
	let seen = 0
	for (let i = 0; i < sql.length; i++) {
		if (sql[i] !== '?') continue
		if (seen === placeholderIndex) {
			return `${sql.slice(0, i)}${replacement}${sql.slice(i + 1)}`
		}
		seen++
	}
	return sql
}

function wrapD1Database(d1: D1Database): D1Database {
	return {
		exec: (sql) => d1.exec(sql),
		prepare: (sql) => {
			const stmt: any = d1.prepare(sql)
			const inlineIndices = getLimitOffsetPlaceholderIndices(sql)
			if (inlineIndices.length === 0) return stmt as D1PreparedStatement

			return new Proxy(stmt, {
				get(target, prop, receiver) {
					if (prop !== 'bind') return Reflect.get(target, prop, receiver)
					return (...args: unknown[]) => {
						let rewrittenSql = sql
						const rewrittenArgs = args.slice()

						for (const idx of inlineIndices) {
							const raw = rewrittenArgs[idx]
							const n =
								typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)

							if (!Number.isFinite(n) || n < 0) {
								// Fallback to original behavior if values are unexpected.
								return (target as any).bind(...args)
							}

							rewrittenSql = replaceNthPlaceholder(
								rewrittenSql,
								idx,
								String(Math.trunc(n)),
							)
							rewrittenArgs.splice(idx, 1)
						}

						const rewrittenStmt: any = d1.prepare(rewrittenSql)
						return rewrittenStmt.bind(...rewrittenArgs)
					}
				},
			}) as unknown as D1PreparedStatement
		},
	}
}

function getInjectedD1Database(): D1Database | undefined {
	return (globalThis as unknown as DbGlobals).__VIDGEN_D1_DB__
}

export function setInjectedD1Database(d1: D1Database | undefined) {
	;(globalThis as unknown as DbGlobals).__VIDGEN_D1_DB__ = d1
}

function isTanStackStartDevServer() {
	return (
		process.env.TSS_DEV_SERVER === 'true' || process.env.TSS_DEV_SERVER === '1'
	)
}

async function tryGetLocalD1SqliteUrl(): Promise<string | null> {
	if (!isTanStackStartDevServer()) return null

	const path = await import('node:path')
	const { readdir } = await import('node:fs/promises')

	const baseDir = path.join(
		process.cwd(),
		'.wrangler',
		'state',
		'v3',
		'd1',
		'miniflare-D1DatabaseObject',
	)

	let entries: string[]
	try {
		entries = await readdir(baseDir)
	} catch {
		return null
	}

	const sqliteFile = entries.filter((f) => f.endsWith('.sqlite')).sort()[0]
	if (!sqliteFile) return null

	const absPath = path.join(baseDir, sqliteFile)
	return `file:${absPath}`
}

let cachedDb: DbClient | null = null
let cachedDbPromise: Promise<DbClient> | null = null

export async function getDb(): Promise<DbClient> {
	if (cachedDb) return cachedDb
	if (cachedDbPromise) return cachedDbPromise

	cachedDbPromise = (async () => {
		try {
			const injectedD1 = getInjectedD1Database()
			const d1 = injectedD1 ? wrapD1Database(injectedD1) : undefined
			if (!d1) {
				const localD1Url = await tryGetLocalD1SqliteUrl()
				if (localD1Url) {
					const { createClient } = await import('@libsql/client')
					const client: any = createClient({ url: localD1Url })

					if (process.env.NODE_ENV !== 'production') {
						await assertLibsqlSchemaReady(client, ['users', 'sessions'])
					}

					const db = drizzleLibsql<typeof schema>(client, { schema }) as any
					cachedDb = db
					return db
				}

				throw new Error('D1_BINDING_MISSING', {
					cause: new Error(
						[
							'Cloudflare D1 binding not found: configure d1_databases binding named DB in wrangler.',
							'TanStack Start: ensure worker entry injects env.DB (e.g. setInjectedD1Database(env.DB)).',
						].join('\n'),
					),
				})
			}

			if (process.env.NODE_ENV !== 'production') {
				await assertD1SchemaReady(d1, ['users', 'sessions'])
			}

			const db = drizzleD1<typeof schema>(d1, { schema })
			cachedDb = db
			return db
		} catch (error) {
			// Don't poison the process with a permanently rejected promise
			// (e.g. dev server starts before local migrations are applied).
			cachedDbPromise = null
			throw error
		}
	})()

	return cachedDbPromise
}

async function assertD1SchemaReady(d1: D1Database, requiredTables: string[]) {
	const missingTables: string[] = []
	for (const table of requiredTables) {
		if (!(await d1HasTable(d1, table))) {
			missingTables.push(table)
		}
	}

	if (missingTables.length === 0) return

	throw new Error('D1_SCHEMA_NOT_READY', {
		cause: new Error(
			[
				`Cloudflare D1 schema not initialized (missing tables: ${missingTables.join(', ')}).`,
				'Run: pnpm db:d1:migrate:local',
				'Check status: pnpm db:d1:list:local',
			].join('\n'),
		),
	})
}

async function assertLibsqlSchemaReady(client: any, requiredTables: string[]) {
	const missingTables: string[] = []
	for (const table of requiredTables) {
		if (!(await libsqlHasTable(client, table))) {
			missingTables.push(table)
		}
	}

	if (missingTables.length === 0) return

	throw new Error('D1_SCHEMA_NOT_READY', {
		cause: new Error(
			[
				`Local D1 schema not initialized (missing tables: ${missingTables.join(', ')}).`,
				'Run: pnpm db:d1:migrate:local',
				'Check status: pnpm db:d1:list:local',
			].join('\n'),
		),
	})
}

async function d1HasTable(d1: D1Database, tableName: string) {
	const row = await d1
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
		.bind(tableName)
		.first()
	return Boolean(row)
}

async function libsqlHasTable(client: any, tableName: string) {
	const res: any = await client.execute({
		sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
		args: [tableName],
	})
	const rows: unknown[] = Array.isArray(res?.rows) ? res.rows : []
	return rows.length > 0
}

export { schema }
export type { TranscriptionWord } from './schema'
export type { D1Database }
