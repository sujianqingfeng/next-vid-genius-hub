import { createFileRoute } from '@tanstack/react-router'
import { handleAgentActionConfirmRequest } from '~/lib/features/ai/server/agent-actions'

export const Route = createFileRoute('/api/agent/actions/confirm')({
	server: {
		handlers: {
			POST: ({ request }) => handleAgentActionConfirmRequest(request),
		},
	},
})
