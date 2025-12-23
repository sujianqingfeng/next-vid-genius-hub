import { createFileRoute, redirect } from '@tanstack/react-router'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/')({
	loader: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)

		throw redirect({ to: me.user ? '/media' : '/marketing' })
	},
	component: () => null,
})

