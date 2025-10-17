import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '~/orpc/router'
import { logger } from '~/lib/logger'

const handler = new RPCHandler(appRouter, {
	interceptors: [
    onError((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error)
        logger.error('api', `[ORPC] Handler error: ${msg}`)
    }),
	],
})

async function handle(request: Request) {
	const { response, matched } = await handler.handle(request, {
		prefix: '/api/orpc',
		context: {},
	})
	
	if (matched) {
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
