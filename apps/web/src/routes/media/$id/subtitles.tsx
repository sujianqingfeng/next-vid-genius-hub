import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { MediaSubtitlesPage } from '~/components/business/media/subtitles/media-subtitles-page'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/media/$id/subtitles')({
	loader: async ({ context, params, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

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
