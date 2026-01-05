import { createFileRoute, redirect } from '@tanstack/react-router'

import { PointsPage } from '~/components/business/points/points-page'
import { queryOrpc } from '~/orpc/client'

const TX_LIMIT = 50

export const Route = createFileRoute('/points')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

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
