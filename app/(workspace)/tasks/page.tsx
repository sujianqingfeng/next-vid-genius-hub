import { dehydrate } from '@tanstack/react-query'
import { TasksPage } from '~/components/business/tasks/tasks-page'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getServerQueryClient } from '~/lib/query/client'
import { HydrateClient } from '~/lib/query/hydration'

type Props = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function TasksRoute({ searchParams }: Props) {
	const params = (await searchParams) ?? {}
	const targetType =
		(typeof params.targetType === 'string' && ['media', 'channel', 'system'].includes(params.targetType))
			? (params.targetType as 'media' | 'channel' | 'system')
			: 'media'
	const targetId = typeof params.targetId === 'string' ? params.targetId : ''

	const queryClient = getServerQueryClient()

	if (targetId) {
		await queryClient.prefetchQuery(
			queryOrpc.task.listByTarget.queryOptions({
				input: { targetType, targetId, limit: 100, offset: 0 },
			}),
		)
	} else {
		await queryClient.prefetchQuery(
			queryOrpc.task.listRecent.queryOptions({
				input: { limit: 50, offset: 0 },
			}),
		)
	}

	const state = dehydrate(queryClient)

	return (
		<HydrateClient state={state}>
			<TasksPage initialTargetType={targetType} initialTargetId={targetId} />
		</HydrateClient>
	)
}
