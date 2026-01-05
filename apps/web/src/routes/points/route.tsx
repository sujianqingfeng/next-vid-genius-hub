import { createFileRoute } from '@tanstack/react-router'

import { PointsPage } from '~/components/business/points/points-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

const TX_LIMIT = 50

export const Route = createFileRoute('/points')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.points.getMyBalance.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.points.listMyTransactions.queryOptions({
					input: { limit: TX_LIMIT, offset: 0 },
				}),
			),
		])
	},
	component: PointsRoute,
})

function PointsRoute() {
	return <PointsPage txLimit={TX_LIMIT} />
}
