import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUser } from '~/lib/features/auth/route-guards'

const SearchSchema = z.object({
	tab: z.enum(['subscriptions', 'proxies']).optional().default('subscriptions'),
	subscriptionId: z.string().optional(),
	page: z.coerce.number().int().min(1).optional().default(1),
})

export const Route = createFileRoute('/proxy')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({
		tab: search.tab,
		subscriptionId: search.subscriptionId,
		page: search.page,
	}),
	loader: async ({ context, deps, location }) => {
		const me = await requireUser({ context, location })

		if (me.user.role === 'admin') {
			throw redirect({ to: '/admin/proxy', search: deps })
		}

		throw redirect({ to: '/media' })
	},
})
