import { createFileRoute } from '@tanstack/react-router'
import { handleAgentChatStreamRequest } from '~/lib/ai/server/agent-chat-stream'

export const Route = createFileRoute('/api/agent/chat-stream')({
	server: {
		handlers: {
			POST: ({ request }) => handleAgentChatStreamRequest(request),
		},
	},
})
