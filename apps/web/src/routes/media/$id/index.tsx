import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { MediaDetailPage } from '~/components/business/media/detail/media-detail-page'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/media/$id/')({
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
	},
	component: MediaDetailIndexRoute,
})

function MediaDetailIndexRoute() {
	const { id } = Route.useParams()
	return <MediaDetailPage id={id} />
}
