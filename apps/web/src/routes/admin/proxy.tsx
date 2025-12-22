import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { AdminProxyPage } from '~/components/business/admin/proxy/admin-proxy-page'
import { DEFAULT_PAGE_LIMIT } from '~/lib/pagination'
import { queryOrpc } from '~/lib/orpc/client'

const SearchSchema = z.object({
	tab: z.enum(['subscriptions', 'proxies']).optional().default('subscriptions'),
	subscriptionId: z.string().optional(),
	page: z.coerce.number().int().min(1).optional().default(1),
})

export const Route = createFileRoute('/admin/proxy')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({
		page: search.page,
		subscriptionId: search.subscriptionId,
	}),
	loader: async ({ context, deps, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.proxy.getSSRSubscriptions.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.proxy.getDefaultProxy.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.proxy.getProxies.queryOptions({
					input: {
						subscriptionId: deps.subscriptionId,
						page: deps.page,
						limit: DEFAULT_PAGE_LIMIT,
					},
				}),
			),
		])
	},
	component: ProxyRoute,
})

function ProxyRoute() {
	const navigate = Route.useNavigate()
	const { tab, subscriptionId, page } = Route.useSearch()
	return (
		<AdminProxyPage
			tab={tab}
			subscriptionId={subscriptionId}
			page={page}
			setSearch={(next) => navigate({ search: next })}
		/>
	)
}
