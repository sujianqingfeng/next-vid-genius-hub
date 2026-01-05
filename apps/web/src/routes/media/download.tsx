import { createFileRoute } from '@tanstack/react-router'
import { MediaDownloadPage } from '~/components/business/media/media-download-page'
import { requireUser } from '~/lib/features/auth/route-guards'
import { queryOrpc } from '~/orpc'

export const Route = createFileRoute('/media/download')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })

		await context.queryClient.prefetchQuery(
			queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
		)
	},
	component: MediaDownloadPage,
})
