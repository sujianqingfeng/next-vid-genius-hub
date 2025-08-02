import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { router } from '~/orpc/router'

const handler = new RPCHandler(router, {
	interceptors: [
		onError((error: any) => {
			console.error(error)
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
