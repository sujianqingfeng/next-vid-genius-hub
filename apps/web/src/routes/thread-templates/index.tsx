import { createFileRoute } from '@tanstack/react-router'
import { ThreadTemplatesPage } from '~/components/business/thread-templates/thread-templates-page'
import { requireUser } from '~/lib/features/auth/route-guards'

export const Route = createFileRoute('/thread-templates/')({
	loader: async ({ context, location }) => {
		await requireUser({ context, location })
	},
	component: ThreadTemplatesPage,
})
