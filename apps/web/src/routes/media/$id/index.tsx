import { createFileRoute, notFound } from '@tanstack/react-router'
import { MediaDetailPage } from '~/components/business/media/detail/media-detail-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

export const Route = createFileRoute('/media/$id/')({
	loader: async ({ context, params, location }) => {
		await requireUser({ context, location })

		const item = await context.queryClient.ensureQueryData(
			queryOrpc.media.byId.queryOptions({ input: { id: params.id } }),
		)

		if (!item) throw notFound()
	},
	component: MediaDetailIndexRoute,
})

function MediaDetailIndexRoute() {
	const { id } = Route.useParams()
	return <MediaDetailPage id={id} />
}
