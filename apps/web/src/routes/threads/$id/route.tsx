import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/threads/$id')({
	component: ThreadDetailLayoutRoute,
})

function ThreadDetailLayoutRoute() {
	return <Outlet />
}

