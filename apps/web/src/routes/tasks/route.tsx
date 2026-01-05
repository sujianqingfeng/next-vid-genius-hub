import { createFileRoute, redirect } from '@tanstack/react-router'

import { TasksPage } from '~/components/business/tasks/tasks-page'
import { queryOrpc } from '~/orpc/client'

const RECENT_LIMIT = 50

export const Route = createFileRoute('/tasks')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpc.task.listRecent.queryOptions({
				input: { limit: RECENT_LIMIT, offset: 0 },
			}),
		)
	},
	component: TasksRoute,
})

function TasksRoute() {
	return <TasksPage recentLimit={RECENT_LIMIT} />
}
