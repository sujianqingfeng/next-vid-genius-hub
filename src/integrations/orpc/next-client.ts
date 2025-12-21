import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { createIsomorphicFn } from '@tanstack/react-start'
import type { AppRouter } from '~/orpc/router'

function isSafeRelativeNext(value: string | undefined | null): value is string {
	if (!value) return false
	if (!value.startsWith('/')) return false
	if (value.startsWith('//')) return false
	return true
}

export function getDefaultRedirect(next: string | undefined | null): string {
	return isSafeRelativeNext(next) ? next : '/media'
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

const getNextApiClient = createIsomorphicFn()
	.server((): RouterClient<AppRouter> => {
		// Server-side: avoid an HTTP self-fetch to `/api/orpc` (which can hang in
		// Workers due to subrequest/header restrictions). Call the router directly.
		const clientPromise = (async () => {
			const [
				{ createRouterClient },
				{ getRequest },
				{ buildRequestContext },
				{ appRouter },
			] = await Promise.all([
				import('@orpc/server'),
				import('@tanstack/start-server-core'),
				import('~/lib/auth/context'),
				import('~/orpc/router'),
			])
			return createRouterClient(appRouter, {
				context: async () => buildRequestContext(getRequest()),
			}) as RouterClient<AppRouter>
		})()

		return createLazyRouterClient(clientPromise)
	})
	.client((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/orpc`,
		})
		return createORPCClient(link) as RouterClient<AppRouter>
	})

export const orpcNext: RouterClient<AppRouter> = getNextApiClient()
export const queryOrpcNext = createTanstackQueryUtils(orpcNext)
