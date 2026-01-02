import { createFileRoute, redirect } from '@tanstack/react-router'

import { AgentChatPage } from '~/components/business/agent/agent-chat-page'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/agent')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: AgentRoute,
})

function AgentRoute() {
	return <AgentChatPage />
}
