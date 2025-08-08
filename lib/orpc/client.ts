import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { AppRouter } from '~/orpc/router'

const link = new RPCLink({
	url: `${
		typeof window !== 'undefined'
			? `${window.location.origin}/api/orpc`
			: (
					() => {
						// Build absolute URL from request headers when on the server
						// Falls back to NEXT_PUBLIC_APP_URL or http://localhost:3000
						const defaultBase =
							process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
						return `${defaultBase}/api/orpc`
					}
				)()
	}`,
	headers: async () => {
		if (typeof window !== 'undefined') {
			return {}
		}
		// Forward incoming request headers when available
		const { headers } = await import('next/headers')
		return Object.fromEntries(await headers())
	},
})

export const orpc: RouterClient<AppRouter> = createORPCClient(link)
