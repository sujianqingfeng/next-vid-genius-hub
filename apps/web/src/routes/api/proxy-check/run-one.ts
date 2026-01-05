import { createFileRoute } from '@tanstack/react-router'
import { handleProxyCheckRunOne } from '~/lib/infra/proxy/server/proxy-check'

export const Route = createFileRoute('/api/proxy-check/run-one')({
	server: {
		handlers: {
			POST: ({ request, context }) =>
				handleProxyCheckRunOne(request, (context as any)?.ctx),
		},
	},
})
