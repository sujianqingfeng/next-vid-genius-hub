import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginPage } from '~/components/business/auth/login-page'

const SearchSchema = z.object({
	next: z.string().optional(),
})

export const Route = createFileRoute('/auth/login')({
	validateSearch: SearchSchema,
	component: LoginRoute,
})

function LoginRoute() {
	const search = Route.useSearch()
	return <LoginPage searchNext={search.next} />
}

