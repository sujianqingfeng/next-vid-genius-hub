import { createFileRoute } from '@tanstack/react-router'
import { ThreadsListPage } from '~/components/business/threads/threads-list-page'

export const Route = createFileRoute('/threads/')({
	component: ThreadsListPage,
})
