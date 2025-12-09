import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
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

let cachedDb: DbClient | null = null

export async function getDb(): Promise<DbClient> {
  if (cachedDb) return cachedDb
  // Prefer async context fetch to work across Next dev processes
  const { env } = await getCloudflareContext({ async: true })
  const d1 = (env as { DB?: D1Database } | undefined)?.DB
  if (!d1) {
    throw new Error(
      'Cloudflare D1 绑定未找到：请在 wrangler.json 中配置 d1_databases，绑定名为 DB，并确保在 next.config.ts 调用 initOpenNextCloudflareForDev()'
    )
  }
  cachedDb = drizzleD1<typeof schema>(d1, { schema })
  return cachedDb
}

export { schema }
export type { TranscriptionWord } from './schema'
