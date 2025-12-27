import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

const SearchSchema = z.object({
	next: z.string().optional(),
})

export const Route = createFileRoute('/login')({
	validateSearch: SearchSchema,
	loader: ({ location }) => {
		const url = new URL(location.href, 'http://local')
		const parsed = SearchSchema.safeParse({
			next: url.searchParams.get('next') ?? undefined,
		})
		throw redirect({
			to: '/auth/login',
			search: parsed.success ? parsed.data : {},
		})
	},
	component: () => null,
})
