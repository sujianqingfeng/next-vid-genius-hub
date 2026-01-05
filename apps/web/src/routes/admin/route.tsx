import { createFileRoute } from '@tanstack/react-router'
import { AdminLayout } from '~/components/business/admin/admin-layout'
import { requireAdmin } from '~/lib/features/auth/route-guards'

export const Route = createFileRoute('/admin')({
	loader: async ({ context, location }) => {
		await requireAdmin({ context, location })
	},
	component: AdminLayout,
})
