import { createFileRoute } from '@tanstack/react-router'
import { handleAgentActionSuggestNextRequest } from '~/lib/features/ai/server/agent-actions'

export const Route = createFileRoute('/api/agent/actions/suggest-next')({
	server: {
		handlers: {
			POST: ({ request }) => handleAgentActionSuggestNextRequest(request),
		},
	},
})
