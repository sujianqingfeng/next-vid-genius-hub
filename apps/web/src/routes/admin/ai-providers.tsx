import { createFileRoute } from '@tanstack/react-router'
import { AdminAiProvidersPage } from '~/components/business/admin/ai-providers/admin-ai-providers-page'
import { queryOrpc } from '~/orpc'

export const Route = createFileRoute('/admin/ai-providers')({
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			queryOrpc.admin.listAiProviders.queryOptions({
				input: { kind: 'llm', enabledOnly: false },
			}),
		)
	},
	component: AdminAiProvidersPage,
})
