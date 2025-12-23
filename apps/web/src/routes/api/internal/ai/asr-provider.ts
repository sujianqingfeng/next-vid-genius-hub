import { createFileRoute } from '@tanstack/react-router'
import { handleInternalAsrProviderRequest } from '~/lib/ai/server/asr-provider'

export const Route = createFileRoute('/api/internal/ai/asr-provider')({
	server: {
		handlers: {
			POST: ({ request }) => handleInternalAsrProviderRequest(request),
		},
	},
})
