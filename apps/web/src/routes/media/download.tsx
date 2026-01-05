import { createFileRoute, redirect } from '@tanstack/react-router'
import { MediaDownloadPage } from '~/components/business/media/media-download-page'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/media/download')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
		)
	},
	component: MediaDownloadPage,
})

