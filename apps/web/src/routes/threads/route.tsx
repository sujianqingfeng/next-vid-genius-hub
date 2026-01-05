import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/threads')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: ThreadsLayoutRoute,
})

function ThreadsLayoutRoute() {
	return <Outlet />
}
