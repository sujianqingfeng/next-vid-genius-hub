import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import { bucketPaths } from '@app/media-domain'
import { and, asc, eq } from 'drizzle-orm'
import { putObjectByKey } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { blocksToPlainText } from '~/lib/thread/utils/plain-text'

function toIso(input: unknown): string | null {
	if (!input) return null
	const d = input instanceof Date ? input : new Date(String(input))
	if (Number.isNaN(d.getTime())) return null
	return d.toISOString()
}

function firstTextBlock(blocks: unknown): string {
	if (!Array.isArray(blocks)) return ''
	const b = blocks.find((x: any) => x && x.type === 'text')
	return b ? String((b as any).data?.text ?? '') : ''
}

export async function buildThreadRenderSnapshot(input: {
	threadId: string
	jobId: string
	userId: string
	templateId: string
	templateConfig?: unknown | null
}): Promise<{ key: string; inputProps: ThreadVideoInputProps }> {
	const db = await getDb()
	const thread = await db.query.threads.findFirst({
		where: and(
			eq(schema.threads.id, input.threadId),
			eq(schema.threads.userId, input.userId),
		),
	})
	if (!thread) throw new Error('Thread not found')

	const posts = await db
		.select()
		.from(schema.threadPosts)
		.where(eq(schema.threadPosts.threadId, thread.id))
		// root first, then replies oldest-first
		.orderBy(asc(schema.threadPosts.depth), asc(schema.threadPosts.createdAt))

	const root = posts.find((p) => p.role === 'root')
	if (!root) throw new Error('Thread root not found')
	const replies = posts.filter((p) => p.role === 'reply')

	const commentsForTiming = replies.map((r) => ({
		id: r.id,
		author: r.authorName,
		content: r.plainText || blocksToPlainText(r.contentBlocks),
		likes: Number((r.metrics as any)?.likes ?? 0) || 0,
		replyCount: 0,
	}))
	const timeline = buildCommentTimeline(commentsForTiming, REMOTION_FPS)

	const rootBlocks = (root.contentBlocks ?? [
		{ id: 'text-0', type: 'text', data: { text: firstTextBlock(root.contentBlocks) } },
	]) as any
	const rootPlain = root.plainText || blocksToPlainText(rootBlocks)

	const inputProps: ThreadVideoInputProps = {
		thread: {
			title: thread.title,
			source: thread.source,
			sourceUrl: thread.sourceUrl ?? null,
		},
		root: {
			id: root.id,
			author: { name: root.authorName, handle: root.authorHandle ?? null },
			contentBlocks: rootBlocks,
			plainText: rootPlain,
			createdAt: toIso(root.createdAt),
			metrics: { likes: Number((root.metrics as any)?.likes ?? 0) || 0 },
		},
		replies: replies.map((r) => ({
			id: r.id,
			author: { name: r.authorName, handle: r.authorHandle ?? null },
			contentBlocks: (r.contentBlocks ?? []) as any,
			plainText: r.plainText || blocksToPlainText((r.contentBlocks ?? []) as any),
			createdAt: toIso(r.createdAt),
			metrics: { likes: Number((r.metrics as any)?.likes ?? 0) || 0 },
		})),
		coverDurationInFrames: timeline.coverDurationInFrames,
		replyDurationsInFrames: timeline.commentDurationsInFrames,
		fps: REMOTION_FPS,
		templateConfig: (input.templateConfig ?? undefined) as any,
	}

	const key = bucketPaths.inputs.comments(thread.id, { title: thread.title })
	await putObjectByKey(
		key,
		'application/json',
		JSON.stringify({
			kind: 'thread-render-snapshot',
			threadId: thread.id,
			jobId: input.jobId,
			templateId: input.templateId,
			inputProps,
		}),
	)

	return { key, inputProps }
}
