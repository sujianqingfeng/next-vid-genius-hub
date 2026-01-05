import { createFileRoute } from '@tanstack/react-router'

import { TasksPage } from '~/components/business/tasks/tasks-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

const RECENT_LIMIT = 50

export const Route = createFileRoute('/tasks')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })

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
