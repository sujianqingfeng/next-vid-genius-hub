import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ThreadTemplateVersionEditorPage } from '~/components/business/thread-templates/thread-template-version-editor-page'
import { requireUser } from '~/lib/features/auth/route-guards'

const SearchSchema = z.object({
	previewThreadId: z.string().optional().default(''),
})

export const Route = createFileRoute(
	'/thread-templates/$libraryId/versions/$versionId/editor',
)({
	validateSearch: SearchSchema,
	loader: async ({ context, location }) => {
		await requireUser({ context, location })
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
