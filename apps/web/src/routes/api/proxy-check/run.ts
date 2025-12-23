import { createFileRoute } from '@tanstack/react-router'
import { handleProxyCheckRun } from '~/lib/proxy/server/proxy-check'

export const Route = createFileRoute('/api/proxy-check/run')({
	server: {
		handlers: {
			POST: ({ request, context }) =>
				handleProxyCheckRun(request, (context as any)?.ctx),
		},
	},
})
