import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminLayout } from '~/components/business/admin/admin-layout'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/admin')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)

		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		if (me.user.role !== 'admin') {
			throw redirect({ to: '/media' })
		}
	},
	component: AdminLayout,
})
