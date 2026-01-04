import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { AgentChatPage } from '~/components/business/agent/agent-chat-page'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/agent')({
	validateSearch: z.object({
		chat: z.string().trim().min(1).optional(),
	}),
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
	const search = Route.useSearch()
	const navigate = Route.useNavigate()

	return (
		<AgentChatPage
			chatId={search.chat ?? null}
			onChangeChatId={(chatId) => {
				void navigate({
					to: '/agent',
					search: (prev) => ({ ...prev, chat: chatId ?? undefined }),
					replace: true,
				})
			}}
		/>
	)
}
