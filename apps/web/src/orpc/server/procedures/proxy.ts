import { asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import { DEFAULT_PAGE_LIMIT } from '~/lib/shared/pagination'
import { getDefaultProxyId, setDefaultProxyId } from '~/lib/infra/proxy/default-proxy'
import { filterOutIpv6Proxies } from '~/lib/infra/proxy/filter'
import {
	ProxyNodeUrlSchema,
	ProxyProtocolEnum,
	parseSSRSubscription,
} from '~/lib/infra/proxy/parser'
import {
	ProxyCheckSettingsInputSchema,
	getProxyCheckSettings as getProxyCheckSettingsFromDb,
	setProxyCheckSettings as setProxyCheckSettingsFromDb,
} from '~/lib/infra/proxy/proxy-settings'
import { os, requireAdmin } from '../base'

const adminOnly = os.use(requireAdmin)

// Schemas
const CreateSSRSubscriptionSchema = z.object({
	name: z.string().min(1).max(100),
	url: z.string().url(),
})

const UpdateSSRSubscriptionSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	url: z.string().url().optional(),
})

const CreateProxySchema = z.object({
	subscriptionId: z.string(),
	name: z.string().max(100).optional(),
	server: z.string().min(1).max(255),
	port: z.number().min(1).max(65535),
	protocol: ProxyProtocolEnum,
	username: z.string().max(100).optional(),
	password: z.string().max(255).optional(),
	nodeUrl: ProxyNodeUrlSchema,
})

const UpdateProxySchema = z.object({
	id: z.string(),
	name: z.string().max(100).optional(),
	server: z.string().min(1).max(255).optional(),
	port: z.number().min(1).max(65535).optional(),
	protocol: ProxyProtocolEnum.optional(),
	username: z.string().max(100).optional(),
	password: z.string().max(255).optional(),
})
// testing schemas removed per request

// Get active proxies for download selection
export const getActiveProxiesForDownload = os
	.input(z.void())
	.handler(async () => {
		try {
			const db = await getDb()
			// Return a simple list: "No Proxy" + all stored proxies (includes test status)
			const statusOrder = sql<number>`case
				when ${schema.proxies.testStatus} = 'success' then 0
				when ${schema.proxies.testStatus} = 'pending' then 1
				when ${schema.proxies.testStatus} = 'failed' then 2
				else 3
			end`
			const [proxyList, defaultProxyId] = await Promise.all([
				db.query.proxies.findMany({
					columns: {
						id: true,
						name: true,
						server: true,
						port: true,
						protocol: true,
						lastTestedAt: true,
						testStatus: true,
						responseTime: true,
					},
					orderBy: [asc(statusOrder), desc(schema.proxies.createdAt)],
				}),
				getDefaultProxyId(db),
			])

			return {
				defaultProxyId,
				proxies: [
					{
						id: 'none',
						name: 'No Proxy',
						server: '',
						port: 0,
						protocol: 'http' as const,
						lastTestedAt: null,
						testStatus: null,
						responseTime: null,
					},
					...proxyList,
				],
			}
		} catch (error) {
			logger.error('proxy', `Error in getActiveProxiesForDownload: ${error}`)
			return {
				defaultProxyId: null,
				proxies: [
					{
						id: 'none',
						name: 'No Proxy',
						server: '',
						port: 0,
						protocol: 'http' as const,
						lastTestedAt: null,
						testStatus: null,
						responseTime: null,
					},
				],
			}
		}
	})

export const getDefaultProxy = os.input(z.void()).handler(async () => {
	const db = await getDb()
	const defaultProxyId = await getDefaultProxyId(db)
	return { defaultProxyId }
})

export const setDefaultProxy = adminOnly
	.input(z.object({ proxyId: z.string().nullable() }))
	.handler(async ({ input }) => {
		const db = await getDb()
		if (input.proxyId) {
			const proxy = await db.query.proxies.findFirst({
				where: eq(schema.proxies.id, input.proxyId),
			})
			if (!proxy) throw new Error('Proxy not found')
		}

		const defaultProxyId = await setDefaultProxyId(input.proxyId, db)
		logger.info('proxy', `Updated default proxy to ${defaultProxyId ?? 'null'}`)
		return { defaultProxyId }
	})

export const getProxyCheckSettings = adminOnly
	.input(z.void())
	.handler(async () => {
		const settings = await getProxyCheckSettingsFromDb()
		return { settings }
	})

export const updateProxyCheckSettings = adminOnly
	.input(ProxyCheckSettingsInputSchema)
	.handler(async ({ input }) => {
		const settings = await setProxyCheckSettingsFromDb(input)
		logger.info('proxy', 'Updated proxy check settings')
		return { settings }
	})

// SSR Subscription Operations
export const getSSRSubscriptions = adminOnly
	.input(z.void())
	.handler(async () => {
		try {
			const db = await getDb()
			// Get subscriptions without relations first
			const subscriptions = await db.query.ssrSubscriptions.findMany({
				orderBy: [desc(schema.ssrSubscriptions.createdAt)],
			})

			// Get proxies for each subscription separately
			const subscriptionsWithProxies = await Promise.all(
				subscriptions.map(async (subscription) => {
					const proxyList = await db.query.proxies.findMany({
						where: eq(schema.proxies.subscriptionId, subscription.id),
						columns: {
							id: true,
							name: true,
							server: true,
							port: true,
							protocol: true,
						},
					})

					return {
						...subscription,
						proxies: proxyList,
					}
				}),
			)

			logger.info(
				'proxy',
				`Fetched subscriptions: ${subscriptionsWithProxies.length}`,
			)
			return { subscriptions: subscriptionsWithProxies }
		} catch (error) {
			logger.error('proxy', `Error in getSSRSubscriptions: ${error}`)
			throw new Error(
				`Failed to fetch SSR subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
		}
	})

export const getSSRSubscription = adminOnly
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.ssrSubscriptions.id, input.id)
		const subscription = await db.query.ssrSubscriptions.findFirst({
			where,
			with: {
				proxies: {
					orderBy: [desc(schema.proxies.createdAt)],
				},
			},
		})

		if (!subscription) {
			logger.error('proxy', 'SSR subscription not found')
			throw new Error('SSR subscription not found')
		}

		return { subscription }
	})

export const createSSRSubscription = adminOnly
	.input(CreateSSRSubscriptionSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const [subscription] = await db
			.insert(schema.ssrSubscriptions)
			.values(input)
			.returning()

		return { subscription }
	})

export const updateSSRSubscription = adminOnly
	.input(UpdateSSRSubscriptionSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.ssrSubscriptions.id, input.id)
		const updateData: Record<string, unknown> = {}

		if (input.name !== undefined) updateData.name = input.name
		if (input.url !== undefined) {
			updateData.url = input.url
			updateData.lastUpdated = new Date()
		}

		const [subscription] = await db
			.update(schema.ssrSubscriptions)
			.set(updateData)
			.where(where)
			.returning()

		if (!subscription) {
			logger.error('proxy', 'SSR subscription not found')
			throw new Error('SSR subscription not found')
		}

		return { subscription }
	})

export const deleteSSRSubscription = adminOnly
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.ssrSubscriptions.id, input.id)

		// First, delete all proxies associated with this subscription
		await db
			.delete(schema.proxies)
			.where(eq(schema.proxies.subscriptionId, input.id))

		// Then delete the subscription
		const [deletedSubscription] = await db
			.delete(schema.ssrSubscriptions)
			.where(where)
			.returning()

		if (!deletedSubscription) {
			logger.error('proxy', 'SSR subscription not found')
			throw new Error('SSR subscription not found')
		}

		logger.info(
			'proxy',
			`Deleted SSR subscription ${input.id} and all its proxies`,
		)
		return { success: true }
	})

// Proxy Operations
export const getProxies = adminOnly
	.input(
		z.object({
			subscriptionId: z.string().optional(),
			page: z.number().default(1),
			limit: z.number().default(DEFAULT_PAGE_LIMIT),
		}),
	)
	.handler(async ({ input }) => {
		const db = await getDb()
		const offset = (input.page - 1) * input.limit

		let whereCondition = undefined
		if (input.subscriptionId) {
			whereCondition = eq(schema.proxies.subscriptionId, input.subscriptionId)
		}

		const [proxyList, countRows] = await Promise.all([
			db.query.proxies.findMany({
				where: whereCondition,
				orderBy: [desc(schema.proxies.createdAt)],
				limit: input.limit,
				offset,
			}),
			whereCondition
				? db
						.select({ count: sql<number>`count(*)` })
						.from(schema.proxies)
						.where(whereCondition)
				: db.select({ count: sql<number>`count(*)` }).from(schema.proxies),
		])

		return {
			proxies: proxyList,
			total: Number((countRows?.[0]?.count ?? 0) as number),
			page: input.page,
			limit: input.limit,
			totalPages: Math.ceil(
				Number((countRows?.[0]?.count ?? 0) as number) / input.limit,
			),
		}
	})

export const getProxy = adminOnly
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.proxies.id, input.id)
		const proxy = await db.query.proxies.findFirst({
			where,
		})

		if (!proxy) {
			logger.error('proxy', 'Proxy not found')
			throw new Error('Proxy not found')
		}

		return { proxy }
	})

export const createProxy = adminOnly
	.input(CreateProxySchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const [proxy] = await db.insert(schema.proxies).values(input).returning()

		return { proxy }
	})

export const updateProxy = adminOnly
	.input(UpdateProxySchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.proxies.id, input.id)
		const updateData: Record<string, unknown> = {}

		if (input.name !== undefined) updateData.name = input.name
		if (input.server !== undefined) updateData.server = input.server
		if (input.port !== undefined) updateData.port = input.port
		if (input.protocol !== undefined) updateData.protocol = input.protocol
		if (input.username !== undefined) updateData.username = input.username
		if (input.password !== undefined) updateData.password = input.password

		const [proxy] = await db
			.update(schema.proxies)
			.set(updateData)
			.where(where)
			.returning()

		if (!proxy) {
			logger.error('proxy', 'Proxy not found')
			throw new Error('Proxy not found')
		}

		return { proxy }
	})

export const deleteProxy = adminOnly
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.proxies.id, input.id)
		const [deletedProxy] = await db
			.delete(schema.proxies)
			.where(where)
			.returning()

		if (!deletedProxy) {
			logger.error('proxy', 'Proxy not found')
			throw new Error('Proxy not found')
		}

		const currentDefault = await getDefaultProxyId(db)
		if (currentDefault === deletedProxy.id) {
			await setDefaultProxyId(null, db)
		}

		return { success: true }
	})

// SSR Import Operations
export const importSSRFromSubscription = adminOnly
	.input(
		z.object({
			subscriptionId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const db = await getDb()
		const where = eq(schema.ssrSubscriptions.id, input.subscriptionId)
		const subscription = await db.query.ssrSubscriptions.findFirst({
			where,
		})

		if (!subscription) {
			logger.error('proxy', 'SSR subscription not found')
			throw new Error('SSR subscription not found')
		}

		try {
			logger.info(
				'proxy',
				`Fetching SSR subscription from: ${subscription.url}`,
			)
			const parsedProxies = await parseSSRSubscription(subscription.url)
			const { proxies, filteredIpv6Count } = filterOutIpv6Proxies(parsedProxies)
			logger.info(
				'proxy',
				`Parsed proxies count: ${parsedProxies.length} (filtered IPv6: ${filteredIpv6Count})`,
			)

			if (proxies.length === 0) {
				throw new Error(
					parsedProxies.length === 0
						? 'No proxy servers found in the subscription. The URL may be invalid or the subscription may be empty.'
						: 'All proxies were IPv6 and were filtered out.',
				)
			}

			// Delete existing proxies for this subscription
			await db
				.delete(schema.proxies)
				.where(eq(schema.proxies.subscriptionId, input.subscriptionId))

			const rows = proxies.map((proxy) => ({
				id: proxy.id,
				name: proxy.name,
				server: proxy.server,
				port: proxy.port,
				protocol: proxy.protocol,
				username: proxy.username ?? null,
				password: proxy.password ?? null,
				subscriptionId: input.subscriptionId,
				nodeUrl: proxy.nodeUrl ?? '',
			}))

			for (const row of rows) {
				try {
					await db.insert(schema.proxies).values(row)
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					logger.error(
						'proxy',
						`Failed to insert proxy ${row.name ?? row.server}:${row.port} — ${msg}`,
					)
					throw err
				}
			}

			// Update subscription last updated time
			await db
				.update(schema.ssrSubscriptions)
				.set({ lastUpdated: new Date() })
				.where(where)

			// Read back rows for this subscription (lightweight and consistent)
			const inserted = await db.query.proxies.findMany({
				where: eq(schema.proxies.subscriptionId, input.subscriptionId),
				orderBy: [desc(schema.proxies.createdAt)],
			})

			return {
				proxies: inserted,
				count: inserted.length,
			}
		} catch (error) {
			logger.error('proxy', `SSR import error: ${error}`)
			throw new Error(
				`Failed to import from SSR subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
		}
	})

// Proxy Testing Operations
// All explicit testing procedures removed per request
