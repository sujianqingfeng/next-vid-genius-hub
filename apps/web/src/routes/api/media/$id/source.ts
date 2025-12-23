import { createFileRoute } from '@tanstack/react-router'
import { handleMediaSourceRequest } from '~/lib/media/server/source'

export const Route = createFileRoute('/api/media/$id/source')({
	server: {
		handlers: {
			GET: ({ request, params }) =>
				handleMediaSourceRequest(request, params.id),
		},
	},
})
