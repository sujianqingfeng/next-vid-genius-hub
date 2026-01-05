import { createFileRoute, redirect } from '@tanstack/react-router'
import { ThreadTemplatesPage } from '~/components/business/thread-templates/thread-templates-page'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/thread-templates/')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: ThreadTemplatesPage,
})

