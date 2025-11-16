import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as schema from './schema'

// Prefer Cloudflare D1 when available (wrangler dev / OpenNext Cloudflare)
// Fallback to libsql (file/turso) when no CF binding is present.
async function ensureLocalD1Migrations(d1: any) {
  if (process.env.NODE_ENV !== 'development') return
  // Only run when Node APIs are available (not in Cloudflare runtime)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsp = require('node:fs/promises') as typeof import('node:fs/promises')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path')

    // Use drizzle/ as the single source of truth for SQL migrations
    const baseDir = path.join(process.cwd(), 'drizzle')

    // Tracking table to avoid reapplying
    await d1.exec('CREATE TABLE IF NOT EXISTS _cfdev_migrations (id TEXT PRIMARY KEY)')

    const entries = await fsp.readdir(baseDir)
    const files = entries
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b))

    for (const file of files) {
      const id = file.replace(/\.sql$/, '')
      const check = await d1.prepare('SELECT 1 FROM _cfdev_migrations WHERE id = ?').bind(id).first()
      if (check) continue

      const sqlRaw = await fsp.readFile(path.join(baseDir, file), 'utf8')
      const statements = sqlRaw
        .split(/\n--\> statement-breakpoint\n/g)
        .map((s) => s.trim())
        .filter(Boolean)

      for (const stmt of statements) {
        await d1.exec(stmt)
      }
      await d1.prepare('INSERT INTO _cfdev_migrations (id) VALUES (?)').bind(id).run()
    }
  } catch {
    // ignore in non-Node environments or if anything fails silently
  }
}

let cachedDb: ReturnType<typeof drizzleD1> | null = null

export async function getDb() {
  if (cachedDb) return cachedDb
  // Prefer async context fetch to work across Next dev processes
  const { env } = await getCloudflareContext({ async: true })
  const d1 = (env as any)?.DB
  if (!d1) {
    throw new Error(
      'Cloudflare D1 绑定未找到：请在 wrangler.json 中配置 d1_databases，绑定名为 DB，并确保在 next.config.ts 调用 initOpenNextCloudflareForDev()'
    )
  }
  // 开发环境自动应用迁移（只在本地 Node 环境执行）
  await ensureLocalD1Migrations(d1)
  cachedDb = drizzleD1(d1, { schema })
  return cachedDb
}

export { schema }
export type { TranscriptionWord } from './schema'
