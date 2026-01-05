import { createFileRoute } from '@tanstack/react-router'
import { ThreadDetailPage } from '~/components/business/threads/thread-detail-page'

export const Route = createFileRoute('/threads/$id/')({
	component: ThreadDetailRoute,
})

function ThreadDetailRoute() {
	const { id } = Route.useParams()
	return <ThreadDetailPage id={id} />
}

