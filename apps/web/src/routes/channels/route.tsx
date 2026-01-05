import { createFileRoute } from '@tanstack/react-router'

import { ChannelsPage } from '~/components/business/channels/channels-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

export const Route = createFileRoute('/channels')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })

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
