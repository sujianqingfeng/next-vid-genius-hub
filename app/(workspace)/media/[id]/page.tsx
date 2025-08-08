import { dehydrate } from '@tanstack/react-query'
import { notFound } from 'next/navigation'
import { MediaDetailPageClient } from '~/components/business/media/media-detail-page'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getServerQueryClient } from '~/lib/query/client'
import { HydrateClient } from '~/lib/query/hydration'

export default async function MediaDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const qc = getServerQueryClient()
	await qc.prefetchQuery(queryOrpc.media.byId.queryOptions({ input: { id } }))

	// Optionally verify existence to produce 404 ASAP (avoids client flash)
	const cached = qc.getQueryData(
		queryOrpc.media.byId.queryKey({ input: { id } }),
	)
	if (cached === null) notFound()

	const state = dehydrate(qc)
	return (
		<HydrateClient state={state}>
			<MediaDetailPageClient id={id} />
		</HydrateClient>
	)
}
