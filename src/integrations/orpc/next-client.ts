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

const getNextApiClient = createIsomorphicFn()
	.server((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: async () => {
				const { getRequestUrl } = await import('@tanstack/start-server-core')
				const origin = new URL(getRequestUrl()).origin
				return `${origin}/api/orpc`
			},
			headers: async () => {
				const { getRequestHeaders } = await import(
					'@tanstack/start-server-core'
				)
				return Object.fromEntries(getRequestHeaders())
			},
		})
		return createORPCClient(link) as RouterClient<AppRouter>
	})
	.client((): RouterClient<AppRouter> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/orpc`,
		})
		return createORPCClient(link) as RouterClient<AppRouter>
	})

export const orpcNext: RouterClient<AppRouter> = getNextApiClient()
export const queryOrpcNext = createTanstackQueryUtils(orpcNext)
