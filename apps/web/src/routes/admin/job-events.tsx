import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AdminJobEventsPage } from '~/components/business/admin/job-events/admin-job-events-page'
import { queryOrpc } from '~/orpc/client'

const SearchSchema = z.object({
	jobId: z.string().trim().optional(),
	taskId: z.string().trim().optional(),
	limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

export const Route = createFileRoute('/admin/job-events')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({
		jobId: search.jobId,
		taskId: search.taskId,
		limit: search.limit,
	}),
	loader: async ({ context, deps }) => {
		await context.queryClient.prefetchQuery(
			queryOrpc.admin.listJobEvents.queryOptions({
				input: {
					jobId: deps.jobId,
					taskId: deps.taskId,
					limit: deps.limit,
				},
			}),
		)
	},
	component: JobEventsRoute,
})

function JobEventsRoute() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	return (
		<AdminJobEventsPage
			jobId={search.jobId}
			taskId={search.taskId}
			limit={search.limit}
			setSearch={(next) => navigate({ search: next })}
		/>
	)
}
