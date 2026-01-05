import { redirect } from '@tanstack/react-router'
import { queryOrpc } from '~/orpc'

type LoaderArgs = {
	context: { queryClient: { ensureQueryData: (opts: unknown) => Promise<any> } }
	location: { href: string }
}

export async function requireUser({ context, location }: LoaderArgs) {
	const me = await context.queryClient.ensureQueryData(
		queryOrpc.auth.me.queryOptions(),
	)

	if (!me?.user) {
		const next = location.href
		throw redirect({ to: '/login', search: { next } })
	}

	return me
}

export async function requireAdmin(args: LoaderArgs) {
	const me = await requireUser(args)

	if (me.user.role !== 'admin') {
		throw redirect({ to: '/media' })
	}

	return me
}

