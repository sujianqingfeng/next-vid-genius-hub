import { createFileRoute } from '@tanstack/react-router'
import { handleCfCallbackRequest } from '~/lib/job/callbacks/cf-callback'

export const Route = createFileRoute('/api/render/cf-callback')({
	server: {
		handlers: {
			POST: ({ request }) => handleCfCallbackRequest(request),
		},
	},
})
