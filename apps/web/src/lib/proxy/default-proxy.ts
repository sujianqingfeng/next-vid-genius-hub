import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'

const DEFAULT_SETTINGS_ID = 'default'

type DbClient = Awaited<ReturnType<typeof getDb>>

export async function getDefaultProxyId(db?: DbClient): Promise<string | null> {
	const database = db ?? (await getDb())
	const settings = await database.query.userSettings.findFirst({
		where: eq(schema.userSettings.id, DEFAULT_SETTINGS_ID),
	})
	return settings?.defaultProxyId ?? null
}

export async function setDefaultProxyId(
	proxyId: string | null,
	db?: DbClient,
): Promise<string | null> {
	const database = db ?? (await getDb())
	const now = new Date()
	const [row] = await database
		.insert(schema.userSettings)
		.values({
			id: DEFAULT_SETTINGS_ID,
			defaultProxyId: proxyId,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: schema.userSettings.id,
			set: { defaultProxyId: proxyId, updatedAt: now },
		})
		.returning()
	return row?.defaultProxyId ?? null
}

export async function resolveProxyWithDefault({
	proxyId,
	db,
}: {
	proxyId?: string | null
	db?: DbClient
}): Promise<{
	proxyId: string | null
	proxyRecord: typeof schema.proxies.$inferSelect | null
}> {
	const database = db ?? (await getDb())
	const effectiveId = proxyId ?? (await getDefaultProxyId(database))
	if (!effectiveId) return { proxyId: null, proxyRecord: null }
	const proxyRecord = await database.query.proxies.findFirst({
		where: eq(schema.proxies.id, effectiveId),
	})
	return {
		proxyId: proxyRecord ? effectiveId : null,
		proxyRecord: proxyRecord ?? null,
	}
}
