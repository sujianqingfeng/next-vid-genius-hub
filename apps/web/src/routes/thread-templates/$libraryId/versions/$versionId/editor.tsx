import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ThreadTemplateVersionEditorPage } from '~/components/business/thread-templates/thread-template-version-editor-page'
import { queryOrpc } from '~/orpc/client'

const SearchSchema = z.object({
	previewThreadId: z.string().optional().default(''),
})

export const Route = createFileRoute(
	'/thread-templates/$libraryId/versions/$versionId/editor',
)({
	validateSearch: SearchSchema,
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: ThreadTemplateVersionEditorRoute,
})

function ThreadTemplateVersionEditorRoute() {
	const { libraryId, versionId } = Route.useParams()
	const { previewThreadId } = Route.useSearch()

	return (
		<ThreadTemplateVersionEditorPage
			libraryId={libraryId}
			versionId={versionId}
			previewThreadId={previewThreadId}
		/>
	)
}

