import { createFileRoute, redirect } from '@tanstack/react-router'
import {
	MediaListPage,
	MediaListSearchSchema,
} from '~/components/business/media/media-list-page'
import { MEDIA_PAGE_SIZE } from '~/lib/shared/pagination'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/media/')({
	validateSearch: MediaListSearchSchema,
	loaderDeps: ({ search }) => ({ page: search.page }),
	loader: async ({ context, deps, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpc.media.list.queryOptions({
				input: { page: deps.page, limit: MEDIA_PAGE_SIZE },
			}),
		)
	},
	component: MediaIndexRoute,
})

function MediaIndexRoute() {
	const navigate = Route.useNavigate()
	const { page } = Route.useSearch()
	return (
		<MediaListPage
			page={page}
			onChangePage={(nextPage) =>
				navigate({ to: '/media', search: { page: nextPage } })
			}
		/>
	)
}

