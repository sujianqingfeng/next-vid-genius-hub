import { createFileRoute, notFound } from '@tanstack/react-router'
import { MediaSubtitlesPage } from '~/components/business/media/subtitles/media-subtitles-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

export const Route = createFileRoute('/media/$id/subtitles')({
	loader: async ({ context, params, location }) => {
		await requireUser({ context, location })

		const item = await context.queryClient.ensureQueryData(
			queryOrpc.media.byId.queryOptions({ input: { id: params.id } }),
		)
		if (!item) throw notFound()

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.ai.listModels.queryOptions({
					input: { kind: 'asr', enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.ai.getDefaultModel.queryOptions({
					input: { kind: 'asr' },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.ai.listModels.queryOptions({
					input: { kind: 'llm', enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.ai.getDefaultModel.queryOptions({
					input: { kind: 'llm' },
				}),
			),
		])
	},
	component: SubtitlesRoute,
})

function SubtitlesRoute() {
	const { id } = Route.useParams()
	return <MediaSubtitlesPage id={id} />
}
