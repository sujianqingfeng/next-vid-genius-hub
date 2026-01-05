import { createFileRoute } from '@tanstack/react-router'
import { AdminAiModelsPage } from '~/components/business/admin/ai-models/admin-ai-models-page'
import { queryOrpc } from '~/orpc/client'

export const Route = createFileRoute('/admin/ai-models')({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.admin.listAiProviders.queryOptions({
					input: { kind: 'llm', enabledOnly: false },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.admin.listAiModels.queryOptions({
					input: { kind: 'llm', enabledOnly: false },
				}),
			),
		])
	},
	component: AdminAiModelsPage,
})
