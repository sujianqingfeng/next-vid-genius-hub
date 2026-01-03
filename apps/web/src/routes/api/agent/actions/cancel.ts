import { createFileRoute } from '@tanstack/react-router'
import { handleAgentActionCancelRequest } from '~/lib/ai/server/agent-actions'

export const Route = createFileRoute('/api/agent/actions/cancel')({
	server: {
		handlers: {
			POST: ({ request }) => handleAgentActionCancelRequest(request),
		},
	},
})
