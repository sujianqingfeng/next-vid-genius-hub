import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import { bucketPaths } from '@app/media-domain'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { putObjectByKey } from '~/lib/cloudflare'
import { presignGetByKey } from '~/lib/cloudflare/storage'
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

	const referencedAssetIds = new Set<string>()
	for (const p of posts) {
		if (p.authorAvatarAssetId) referencedAssetIds.add(p.authorAvatarAssetId)
		for (const b of (p.contentBlocks ?? []) as any[]) {
			if (!b || typeof b !== 'object') continue
			if (b.type === 'image' || b.type === 'video') {
				const id = (b as any).data?.assetId
				if (typeof id === 'string' && id) referencedAssetIds.add(id)
			}
			if (b.type === 'link') {
				const id = (b as any).data?.previewAssetId
				if (typeof id === 'string' && id) referencedAssetIds.add(id)
			}
		}
	}

	const assetsMap: NonNullable<ThreadVideoInputProps['assets']> = {}
	if (referencedAssetIds.size > 0) {
		const ids = [...referencedAssetIds]
		const assetRows = await db
			.select()
			.from(schema.threadAssets)
			.where(
				and(
					eq(schema.threadAssets.userId, input.userId),
					inArray(schema.threadAssets.id, ids),
				),
			)

		const byId = new Map<string, any>()
		for (const a of assetRows) byId.set(String(a.id), a)

		for (const id of referencedAssetIds) {
			const a = byId.get(id)
			if (!a) continue
			let url: string | null = a.sourceUrl ?? null
			if (a.storageKey) {
				try {
					url = await presignGetByKey(String(a.storageKey))
				} catch {
					url = a.sourceUrl ?? null
				}
			}
			if (!url) continue
			assetsMap[String(a.id)] = {
				id: String(a.id),
				kind: a.kind,
				url,
			}
		}
	}

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
		assets: Object.keys(assetsMap).length > 0 ? assetsMap : undefined,
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
