import { createFileRoute, redirect } from '@tanstack/react-router'

import { ChannelsPage } from '~/components/business/channels/channels-page'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/channels')({
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
				queryOrpc.channel.listChannels.queryOptions({}),
			),
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
	component: ChannelsRoute,
})

function ChannelsRoute() {
	return <ChannelsPage />
}
