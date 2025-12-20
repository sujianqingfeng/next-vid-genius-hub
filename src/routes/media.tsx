import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/media')({
	component: MediaLayoutRoute,
})

function MediaLayoutRoute() {
	return <Outlet />
}
