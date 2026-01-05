import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireUser } from '~/lib/features/auth/route-guards'

export const Route = createFileRoute('/threads')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })
	},
	component: ThreadsLayoutRoute,
})

function ThreadsLayoutRoute() {
	return <Outlet />
}
