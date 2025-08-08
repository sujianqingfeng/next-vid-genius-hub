import { dehydrate } from '@tanstack/react-query'
import { MediaListPage } from '~/components/business/media/media-list-page'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getServerQueryClient } from '~/lib/query/client'
import { HydrateClient } from '~/lib/query/hydration'

const PAGE_SIZE = 12

export default async function MediaPage() {
	const queryClient = getServerQueryClient()
	// Prefetch first page to avoid waterfall and improve TTFB
	await queryClient.prefetchQuery(
		queryOrpc.media.list.queryOptions({ input: { page: 1, limit: PAGE_SIZE } }),
	)

	const state = dehydrate(queryClient)
	return (
		<HydrateClient state={state}>
			<MediaListPage />
		</HydrateClient>
	)
}
