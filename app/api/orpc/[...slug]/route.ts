import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '~/orpc/router'
import { logger } from '~/lib/logger'
import { buildRequestContext } from '~/lib/auth/context'
export const runtime = 'nodejs'

const handler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error, options) => {
			const req = (options as { request?: { method?: unknown; url?: unknown } })
				.request
			const method = typeof req?.method === 'string' ? req.method : 'UNKNOWN'
			const url = typeof req?.url === 'string' ? req.url : 'UNKNOWN'

			if (error instanceof ORPCError) {
				const json = error.toJSON()
				const issues = (json.data as any)?.issues
				const issuesText = issues ? ` issues=${JSON.stringify(issues)}` : ''

				logger.error(
					'api',
					`[ORPC] Handler error: code=${json.code} status=${json.status} msg=${json.message} method=${method} url=${url}${issuesText}`,
				)
				return
			}

			const msg = error instanceof Error ? error.message : String(error)
			logger.error('api', `[ORPC] Handler error: ${msg} method=${method} url=${url}`)
		}),
	],
})

async function handle(request: Request) {
	const context = await buildRequestContext(request)
	const { response, matched } = await handler.handle(request, {
		prefix: '/api/orpc',
		context,
	})
	
	if (matched) {
		if (context.responseCookies.length > 0) {
			for (const cookie of context.responseCookies) {
				response.headers.append('Set-Cookie', cookie)
			}
		}
		return response
	}
	
	return new Response('Not Found', { status: 404 })
}

export {
	handle as GET,
	handle as POST,
	handle as PUT,
	handle as PATCH,
	handle as DELETE,
	handle as HEAD,
}
