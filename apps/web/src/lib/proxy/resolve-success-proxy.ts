import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import {
	throwNoSuccessProxyError,
	throwProxyNotSuccessError,
} from '~/lib/orpc/errors'
import { getDefaultProxyId } from '~/lib/proxy/default-proxy'
import { pickBestSuccessProxyId } from './pick-best-success-proxy'

type DbClient = Awaited<ReturnType<typeof getDb>>

export async function resolveSuccessProxy({
	requestedProxyId,
	preferredProxyId,
	db,
}: {
	requestedProxyId?: string | null
	preferredProxyId?: string | null
	db?: DbClient
}): Promise<{
	proxyId: string
	proxyRecord: typeof schema.proxies.$inferSelect
}> {
	const database = db ?? (await getDb())

	if (requestedProxyId) {
		const proxyRecord = await database.query.proxies.findFirst({
			where: eq(schema.proxies.id, requestedProxyId),
		})
		if (!proxyRecord) {
			throwProxyNotSuccessError('Proxy not found')
		}
		if (proxyRecord.testStatus !== 'success') {
			throwProxyNotSuccessError(
				'Proxy is not available (status is not success)',
			)
		}
		return { proxyId: proxyRecord.id, proxyRecord }
	}

	if (preferredProxyId) {
		const proxyRecord = await database.query.proxies.findFirst({
			where: eq(schema.proxies.id, preferredProxyId),
		})
		if (proxyRecord?.testStatus === 'success') {
			return { proxyId: proxyRecord.id, proxyRecord }
		}
	}

	const defaultProxyId = await getDefaultProxyId(database)
	if (defaultProxyId) {
		const proxyRecord = await database.query.proxies.findFirst({
			where: eq(schema.proxies.id, defaultProxyId),
		})
		if (proxyRecord?.testStatus === 'success') {
			return { proxyId: proxyRecord.id, proxyRecord }
		}
	}

	const successCandidates = await database.query.proxies.findMany({
		where: eq(schema.proxies.testStatus, 'success'),
		columns: { id: true, responseTime: true, createdAt: true },
	})
	const bestId = pickBestSuccessProxyId(successCandidates)
	if (!bestId) {
		throwNoSuccessProxyError('No success proxy available for download')
	}

	const proxyRecord = await database.query.proxies.findFirst({
		where: eq(schema.proxies.id, bestId),
	})
	if (!proxyRecord) {
		throwNoSuccessProxyError('No success proxy available for download')
	}

	return { proxyId: proxyRecord.id, proxyRecord }
}
