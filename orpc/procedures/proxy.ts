import { z } from 'zod'
import { os } from '@orpc/server'
import { eq, desc } from 'drizzle-orm'
import { logger } from '~/lib/logger'
import { db, schema } from '~/lib/db'
import { parseSSRSubscription } from '~/lib/proxy/parser'

// Schemas
const CreateSSRSubscriptionSchema = z.object({
	name: z.string().min(1).max(100),
	url: z.string().url(),
})

const UpdateSSRSubscriptionSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	url: z.string().url().optional(),
	isActive: z.boolean().optional(),
})

const CreateProxySchema = z.object({
	subscriptionId: z.string(),
	name: z.string().max(100).optional(),
	server: z.string().min(1).max(255),
	port: z.number().min(1).max(65535),
	protocol: z.enum(['http', 'https', 'socks4', 'socks5']),
	username: z.string().max(100).optional(),
	password: z.string().max(255).optional(),
	ssrUrl: z.string().url().startsWith('ssr://'),
})

const UpdateProxySchema = z.object({
	id: z.string(),
	name: z.string().max(100).optional(),
	server: z.string().min(1).max(255).optional(),
	port: z.number().min(1).max(65535).optional(),
	protocol: z.enum(['http', 'https', 'socks4', 'socks5']).optional(),
	username: z.string().max(100).optional(),
	password: z.string().max(255).optional(),
	isActive: z.boolean().optional(),
})
// testing schemas removed per request

// Get active proxies for download selection
export const getActiveProxiesForDownload = os
	.input(z.void())
	.handler(async () => {
		try {
			// Return a simple list: "No Proxy" + all stored proxies (no test status)
			const proxyList = await db.query.proxies.findMany({
				columns: {
					id: true,
					name: true,
					server: true,
					port: true,
					protocol: true,
					isActive: true,
				},
				orderBy: [desc(schema.proxies.createdAt)],
			})

			return {
				proxies: [
					{ id: 'none', name: 'No Proxy', server: '', port: 0, protocol: 'http' as const, isActive: false },
					...proxyList,
				],
			}
		} catch (error) {
			logger.error('proxy', `Error in getActiveProxiesForDownload: ${error}`)
			return { proxies: [{ id: 'none', name: 'No Proxy', server: '', port: 0, protocol: 'http' as const, isActive: false }] }
		}
	})

// SSR Subscription Operations
export const getSSRSubscriptions = os
	.input(z.void())
	.handler(async () => {
		try {
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
                        isActive: true,
                    },
					})
					
					return {
						...subscription,
						proxies: proxyList,
					}
				})
			)
			
			logger.info('proxy', `Fetched subscriptions: ${subscriptionsWithProxies.length}`)
			return { subscriptions: subscriptionsWithProxies }
		} catch (error) {
			logger.error('proxy', `Error in getSSRSubscriptions: ${error}`)
			throw new Error(`Failed to fetch SSR subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	})

export const getSSRSubscription = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
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

export const createSSRSubscription = os
	.input(CreateSSRSubscriptionSchema)
	.handler(async ({ input }) => {
		const [subscription] = await db
			.insert(schema.ssrSubscriptions)
			.values(input)
			.returning()

		return { subscription }
	})

export const updateSSRSubscription = os
	.input(UpdateSSRSubscriptionSchema)
	.handler(async ({ input }) => {
		const where = eq(schema.ssrSubscriptions.id, input.id)
		const updateData: Record<string, unknown> = {}

		if (input.name !== undefined) updateData.name = input.name
		if (input.url !== undefined) updateData.url = input.url
		if (input.isActive !== undefined) {
			updateData.isActive = input.isActive
			updateData.lastUpdated = new Date()
		}

		// If setting this subscription as active, deactivate all others
		if (input.isActive) {
			await db
				.update(schema.ssrSubscriptions)
				.set({ isActive: false })
				.where(where)
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

export const deleteSSRSubscription = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
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

		logger.info('proxy', `Deleted SSR subscription ${input.id} and all its proxies`)
		return { success: true }
	})

// Proxy Operations
export const getProxies = os
	.input(z.object({ 
		subscriptionId: z.string().optional(),
		page: z.number().default(1),
		limit: z.number().default(20),
	}))
	.handler(async ({ input }) => {
		const offset = (input.page - 1) * input.limit

		let whereCondition = undefined
		if (input.subscriptionId) {
			whereCondition = eq(schema.proxies.subscriptionId, input.subscriptionId)
		}

		const [proxyList, totalCount] = await Promise.all([
			db.query.proxies.findMany({
				where: whereCondition,
				orderBy: [desc(schema.proxies.createdAt)],
				limit: input.limit,
				offset,
			}),
			db.query.proxies.findMany({
				where: whereCondition,
			}).then(list => list.length),
		])

		return {
			proxies: proxyList,
			total: totalCount,
			page: input.page,
			limit: input.limit,
			totalPages: Math.ceil(totalCount / input.limit),
		}
	})

export const getProxy = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
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

export const createProxy = os
	.input(CreateProxySchema)
	.handler(async ({ input }) => {
		const [proxy] = await db
			.insert(schema.proxies)
			.values(input)
			.returning()

		return { proxy }
	})

export const updateProxy = os
	.input(UpdateProxySchema)
	.handler(async ({ input }) => {
		const where = eq(schema.proxies.id, input.id)
		const updateData: Record<string, unknown> = {}

		if (input.name !== undefined) updateData.name = input.name
		if (input.server !== undefined) updateData.server = input.server
		if (input.port !== undefined) updateData.port = input.port
		if (input.protocol !== undefined) updateData.protocol = input.protocol
		if (input.username !== undefined) updateData.username = input.username
		if (input.password !== undefined) updateData.password = input.password
		if (input.isActive !== undefined) updateData.isActive = input.isActive

		// If setting this proxy as active, deactivate all other proxies
		if (input.isActive) {
			await db
				.update(schema.proxies)
				.set({ isActive: false })
				.where(where)
		}

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

export const deleteProxy = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const where = eq(schema.proxies.id, input.id)
		const [deletedProxy] = await db
			.delete(schema.proxies)
			.where(where)
			.returning()

		if (!deletedProxy) {
			logger.error('proxy', 'Proxy not found')
			throw new Error('Proxy not found')
		}

		return { success: true }
	})

// SSR Import Operations
export const importSSRFromSubscription = os
	.input(z.object({ 
		subscriptionId: z.string(),
	}))
	.handler(async ({ input }) => {
		const where = eq(schema.ssrSubscriptions.id, input.subscriptionId)
		const subscription = await db.query.ssrSubscriptions.findFirst({
			where,
		})

		if (!subscription) {
			logger.error('proxy', 'SSR subscription not found')
			throw new Error('SSR subscription not found')
		}

		try {
			logger.info('proxy', `Fetching SSR subscription from: ${subscription.url}`)
			const parsedProxies = await parseSSRSubscription(subscription.url)
			logger.info('proxy', `Parsed proxies count: ${parsedProxies.length}`)
			
			if (parsedProxies.length === 0) {
				throw new Error('No proxy servers found in the subscription. The URL may be invalid or the subscription may be empty.')
			}
			
			// Delete existing proxies for this subscription
			await db
				.delete(schema.proxies)
				.where(eq(schema.proxies.subscriptionId, input.subscriptionId))

			// Insert new proxies (preserve original SSR URL so we can identify SSR nodes later)
			const insertedProxies = await db
				.insert(schema.proxies)
				.values(
					parsedProxies.map(proxy => ({
						id: proxy.id,
						name: proxy.name,
						server: proxy.server,
						port: proxy.port,
						protocol: proxy.protocol,
						username: proxy.username,
						password: proxy.password,
						subscriptionId: input.subscriptionId,
						ssrUrl: proxy.ssrUrl ?? '',
					}))
				)
				.returning()

			// Update subscription last updated time
			await db
				.update(schema.ssrSubscriptions)
				.set({ lastUpdated: new Date() })
				.where(where)

			return { 
				proxies: insertedProxies,
				count: insertedProxies.length,
			}
		} catch (error) {
			logger.error('proxy', `SSR import error: ${error}`)
			throw new Error(`Failed to import from SSR subscription: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	})



// Proxy Testing Operations
// All explicit testing procedures removed per request
