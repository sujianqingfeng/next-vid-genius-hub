import { createFileRoute } from '@tanstack/react-router'
import { handleMediaSourceRequest } from '~/lib/domain/media/server/source'

export const Route = createFileRoute('/api/media/$id/source')({
	server: {
		handlers: {
			GET: ({ request, params }) =>
				handleMediaSourceRequest(request, params.id),
		},
	},
})
