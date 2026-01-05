import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AgentChatPage } from '~/components/business/agent/agent-chat-page'
import { requireUser } from '~/lib/features/auth/route-guards'

export const Route = createFileRoute('/agent')({
	validateSearch: z.object({
		chat: z.string().trim().min(1).optional(),
	}),
	loader: async ({ context, location }) => {
		await requireUser({ context, location })
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
