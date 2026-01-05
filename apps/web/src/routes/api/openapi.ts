import { createFileRoute } from '@tanstack/react-router'

import { handleOpenApiRequest } from '~/orpc/http/openapi'

export const Route = createFileRoute('/api/openapi')({
	server: {
		handlers: {
			GET: handleOpenApiRequest,
		},
	},
})
