import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { createIsomorphicFn } from '@tanstack/react-start'
import type { AppRouter } from '~/orpc/router'

function isSafeRelativeRedirect(
	value: string | undefined | null,
): value is string {
	if (!value) return false
	if (!value.startsWith('/')) return false
	if (value.startsWith('//')) return false
	return true
}

export function getDefaultRedirect(next: string | undefined | null): string {
	return isSafeRelativeRedirect(next) ? next : '/media'
}

function createLazyRouterClient<T extends RouterClient<any>>(
	clientPromise: Promise<T>,
	path: string[] = [],
): T {
	const caller = (...args: any[]) =>
		clientPromise.then((client: any) => {
			let target: any = client
			for (const seg of path) target = target?.[seg]
			if (typeof target !== 'function') {
				throw new Error(`ORPC client path is not callable: ${path.join('.')}`)
			}
			return target(...args)
		})

	return new Proxy(caller as any, {
		get(_target, prop) {
			// Prevent treating this proxy as a Promise/thenable.
			if (prop === 'then') return undefined
			if (typeof prop !== 'string') return (caller as any)[prop]
			return createLazyRouterClient(clientPromise, [...path, prop])
		},
	}) as any
}

function createLazyRouterClientFactory<T extends RouterClient<any>>(
	getClient: () => T,
	path: string[] = [],
): T {
	const caller = (...args: any[]) => {
		const client: any = getClient()
		let target: any = client
		for (const seg of path) target = target?.[seg]
		if (typeof target !== 'function') {
			throw new Error(`ORPC client path is not callable: ${path.join('.')}`)
		}
		return target(...args)
	}

	return new Proxy(caller as any, {
		get(_target, prop) {
			// Prevent treating this proxy as a Promise/thenable.
			if (prop === 'then') return undefined
			if (typeof prop !== 'string') return (caller as any)[prop]
			return createLazyRouterClientFactory(getClient, [...path, prop])
		},
	}) as any
}

const getOrpcClient = createIsomorphicFn()
	.server((): RouterClient<AppRouter> => {
		// Server-side: avoid an HTTP self-fetch to `/api/orpc` (which can hang in
		// Workers due to subrequest/header restrictions). Call the router directly.
		const logError = (message: string, error: unknown) => {
			// oxlint-disable-next-line no-console
			console.error('[orpc:ssr]', message, error)
		}

		const clientPromise = (async () => {
			try {
				const [
					{ createRouterClient },
					{ getRequestHeaders },
					{ buildRequestContext },
					{ appRouter },
				] = await Promise.all([
					import('@orpc/server'),
					import('@tanstack/react-start/server'),
					import('~/lib/auth/context'),
					import('~/orpc/router'),
				])
				return createRouterClient(appRouter, {
					context: async () => {
						let headers: Headers
						try {
							headers = new Headers(getRequestHeaders())
						} catch (error) {
							logError('getRequestHeaders failed, falling back:', error)
							headers = new Headers()
						}

						const request = new Request('http://local/orpc-ssr', { headers })
						return buildRequestContext(request)
					},
				}) as RouterClient<AppRouter>
			} catch (error) {
				logError('failed to initialize router client:', error)
				throw error
			}
		})()

		return createLazyRouterClient(clientPromise)
	})
	.client((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/orpc`,
		})
		return createORPCClient(link) as RouterClient<AppRouter>
	})

let cachedOrpcClient: RouterClient<AppRouter> | null = null
function getCachedOrpcClient(): RouterClient<AppRouter> {
	if (cachedOrpcClient) return cachedOrpcClient
	cachedOrpcClient = getOrpcClient()
	return cachedOrpcClient
}

export const orpcClient: RouterClient<AppRouter> =
	createLazyRouterClientFactory(getCachedOrpcClient)
export const queryOrpc = createTanstackQueryUtils(orpcClient)
