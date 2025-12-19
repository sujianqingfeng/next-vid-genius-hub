import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import * as schema from './schema'

// Prefer Cloudflare D1 when available (wrangler dev / OpenNext Cloudflare)
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

function getInjectedD1Database(): D1Database | undefined {
	return (globalThis as unknown as DbGlobals).__VIDGEN_D1_DB__
}

export function setInjectedD1Database(d1: D1Database | undefined) {
	(globalThis as unknown as DbGlobals).__VIDGEN_D1_DB__ = d1
}

let cachedDb: DbClient | null = null
let cachedDbPromise: Promise<DbClient> | null = null

export async function getDb(): Promise<DbClient> {
	if (cachedDb) return cachedDb
	if (cachedDbPromise) return cachedDbPromise

	cachedDbPromise = (async () => {
		try {
			const injectedD1 = getInjectedD1Database()
			const d1 = injectedD1 ?? (await getD1FromOpenNext())
			if (!d1) {
				throw new Error(
					[
						'Cloudflare D1 绑定未找到：请在 wrangler 配置中设置 d1_databases 绑定名为 DB。',
						'Next/OpenNext：确保 next.config.ts 调用 initOpenNextCloudflareForDev()，或线上 Worker 有 DB 绑定。',
						'TanStack Start：确保 worker entry 将 env.DB 注入到应用（例如通过 setInjectedD1Database(env.DB)）。',
					].join('\n'),
				)
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

async function getD1FromOpenNext(): Promise<D1Database | undefined> {
	try {
		// Prefer async context fetch to work across Next dev processes
		const { getCloudflareContext } = await import('@opennextjs/cloudflare')
		const { env } = await getCloudflareContext({ async: true })
		return (env as { DB?: D1Database } | undefined)?.DB
	} catch {
		return undefined
	}
}

async function assertD1SchemaReady(d1: D1Database, requiredTables: string[]) {
	const missingTables: string[] = []
	for (const table of requiredTables) {
		if (!(await d1HasTable(d1, table))) {
			missingTables.push(table)
		}
	}

	if (missingTables.length === 0) return

	throw new Error(
		[
			`Cloudflare D1 数据库未初始化（缺少表：${missingTables.join(', ')}）。`,
			'请先运行：pnpm db:d1:migrate:local',
			'如需查看迁移状态：pnpm db:d1:list:local',
		].join('\n'),
	)
}

async function d1HasTable(d1: D1Database, tableName: string) {
	const row = await d1
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
		.bind(tableName)
		.first()
	return Boolean(row)
}

export { schema }
export type { TranscriptionWord } from './schema'
export type { D1Database }
