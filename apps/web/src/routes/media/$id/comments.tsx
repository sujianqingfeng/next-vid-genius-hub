import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import {
	MediaCommentsPage,
	type MediaCommentsTab,
} from '~/components/business/media/comments/media-comments-page'
import { queryOrpc } from '~/orpc/client'

const SearchSchema = z.object({
	tab: z.preprocess(
		(value) => (value === 'moderate' ? 'basics' : value),
		z
			.enum(['basics', 'download', 'translate', 'render'])
			.optional()
			.default('basics'),
	),
})

export const Route = createFileRoute('/media/$id/comments')({
	validateSearch: SearchSchema,
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
				queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
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
	component: MediaCommentsRoute,
})

function MediaCommentsRoute() {
	const { id } = Route.useParams()
	const { tab } = Route.useSearch()
	const navigate = Route.useNavigate()

	return (
		<MediaCommentsPage
			id={id}
			tab={tab as MediaCommentsTab}
			onTabChange={(next) => {
				navigate({
					search: (prev) => ({ ...prev, tab: next }),
					replace: true,
				})
			}}
		/>
	)
}
