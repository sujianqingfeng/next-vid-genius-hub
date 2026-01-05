import { createFileRoute } from '@tanstack/react-router'
import { ThreadsNewPage } from '~/components/business/threads/threads-new-page'

export const Route = createFileRoute('/threads/new')({
	component: ThreadsNewPage,
})
