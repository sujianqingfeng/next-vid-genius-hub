import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

const SearchSchema = z.object({
	next: z.string().optional(),
})

export const Route = createFileRoute('/login')({
	validateSearch: SearchSchema,
	loader: ({ search }) => {
		throw redirect({ to: '/auth/login', search })
	},
	component: () => null,
})
