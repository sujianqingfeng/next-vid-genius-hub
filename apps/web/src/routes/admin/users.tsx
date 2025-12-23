import { createFileRoute } from '@tanstack/react-router'
import { AdminUsersPage } from '~/components/business/admin/users/admin-users-page'
import { ADMIN_USERS_PAGE_SIZE } from '~/lib/pagination'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/admin/users')({
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			queryOrpc.admin.listUsers.queryOptions({
				input: { page: 1, limit: ADMIN_USERS_PAGE_SIZE, q: undefined },
			}),
		)
	},
	component: AdminUsersPage,
})
