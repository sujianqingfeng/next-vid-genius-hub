import { createFileRoute } from '@tanstack/react-router'

import { handleOpenApiRequest } from '~/lib/orpc/server/openapi'

export const Route = createFileRoute('/api/openapi')({
	server: {
		handlers: {
			GET: handleOpenApiRequest,
		},
	},
})
