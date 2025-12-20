import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/media/$id')({
	component: MediaIdLayoutRoute,
})

function MediaIdLayoutRoute() {
	return <Outlet />
}
