import { createFileRoute } from '@tanstack/react-router'

import { AdminPointsPricingPage } from '~/components/business/admin/points-pricing/points-pricing-page'
import { ADMIN_PRICING_RULES_PAGE_SIZE } from '~/lib/pagination'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/admin/points-pricing')({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.admin.listPricingRules.queryOptions({
					input: {
						page: 1,
						limit: ADMIN_PRICING_RULES_PAGE_SIZE,
						resourceType: 'llm',
					},
				}),
			),
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
	component: AdminPointsPricingPage,
})
