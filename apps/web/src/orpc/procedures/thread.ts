import { os } from '@orpc/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { getJobStatus } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { createId } from '~/lib/utils/id'
import {
	buildThreadPostsInsertFromDraft,
	buildThreadInsertFromDraft,
	parseXThreadImportDraft,
} from '~/lib/thread/adapters/x'
import { blocksToPlainText } from '~/lib/thread/utils/plain-text'
import { buildThreadRenderSnapshot } from '~/lib/thread/render-snapshot'
import {
	DEFAULT_THREAD_TEMPLATE_ID,
	type ThreadTemplateId,
} from '@app/remotion-project/thread-templates'

export const list = os.handler(async ({ context }) => {
	const ctx = context as RequestContext
	const userId = ctx.auth.user!.id
	const db = await getDb()
	const items = await db
		.select()
		.from(schema.threads)
		.where(eq(schema.threads.userId, userId))
		.orderBy(desc(schema.threads.createdAt))
		.limit(50)
	return { items }
})

export const byId = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(eq(schema.threads.id, input.id), eq(schema.threads.userId, userId)),
		})
		if (!thread) throw new Error('Thread not found')

		const posts = await db
			.select()
			.from(schema.threadPosts)
			.where(eq(schema.threadPosts.threadId, thread.id))
			.orderBy(asc(schema.threadPosts.depth), asc(schema.threadPosts.createdAt))

		const root = posts.find((p) => p.role === 'root') ?? null
		const replies = posts.filter((p) => p.role === 'reply')

		return { thread, root, replies }
	})

export const createFromXJson = os
	.input(
		z.object({
			jsonText: z.string().min(2),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const now = new Date()

		let raw: unknown
		try {
			raw = JSON.parse(input.jsonText)
		} catch {
			throw new Error('Invalid JSON')
		}

		const draft = parseXThreadImportDraft(raw)

		const db = await getDb()

		const existing = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.userId, userId),
				eq(schema.threads.source, 'x'),
				eq(schema.threads.sourceId, draft.sourceId),
			),
		})

		const threadId = existing?.id ?? createId()
		const isExisting = Boolean(existing)

		if (!existing) {
			const thread = buildThreadInsertFromDraft({
				id: threadId,
				userId,
				now,
				draft,
			})
			await db.insert(schema.threads).values(thread)
		} else {
			// Keep user edits (title/template) intact; only touch updatedAt and
			// backfill sourceUrl if missing.
			const updates: Partial<typeof schema.threads.$inferInsert> = {
				updatedAt: now,
			}
			if (!existing.sourceUrl && draft.sourceUrl) updates.sourceUrl = draft.sourceUrl
			await db.update(schema.threads).set(updates).where(eq(schema.threads.id, existing.id))
		}

		const postDrafts = buildThreadPostsInsertFromDraft({ threadId, draft })
		const postRows = postDrafts.map((p) => ({
			id: createId(),
			threadId: p.threadId,
			sourcePostId: p.sourcePostId ?? null,
			role: p.role,
			authorName: p.author.name,
			authorHandle: p.author.handle ?? null,
			authorProfileUrl: p.author.profileUrl ?? null,
			authorAvatarAssetId: p.author.avatarAssetId ?? null,
			contentBlocks: p.contentBlocks,
			plainText: p.plainText,
			metrics: p.metrics ?? null,
			depth: p.depth,
			parentSourcePostId: p.parentSourcePostId ?? null,
			raw: p.raw ?? null,
			createdAt: p.createdAt ?? null,
			editedAt: null,
			updatedAt: now,
		}))

		let repaired = false
		if (isExisting) {
			// If a previous import partially created the thread but failed to insert
			// posts, allow re-import to repair. Otherwise, avoid overwriting edits.
			const root = await db.query.threadPosts.findFirst({
				where: and(
					eq(schema.threadPosts.threadId, threadId),
					eq(schema.threadPosts.role, 'root'),
				),
				columns: { id: true },
			})

			if (!root) {
				repaired = true
				await db
					.delete(schema.threadPosts)
					.where(eq(schema.threadPosts.threadId, threadId))
			} else {
				return { id: threadId, existed: true, repaired: false }
			}
		}

		// Cloudflare D1 has a relatively low bind-parameter limit per statement,
		// so chunk multi-row inserts to avoid "too many SQL variables" errors.
		const CHUNK_SIZE = 5
		for (let i = 0; i < postRows.length; i += CHUNK_SIZE) {
			await db.insert(schema.threadPosts).values(postRows.slice(i, i + CHUNK_SIZE))
		}

		return { id: threadId, existed: isExisting, repaired }
	})

export const updatePostText = os
	.input(
		z.object({
			threadId: z.string().min(1),
			postId: z.string().min(1),
			text: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const now = new Date()

		const thread = await db.query.threads.findFirst({
			where: and(eq(schema.threads.id, input.threadId), eq(schema.threads.userId, userId)),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		const post = await db.query.threadPosts.findFirst({
			where: and(eq(schema.threadPosts.id, input.postId), eq(schema.threadPosts.threadId, thread.id)),
		})
		if (!post) throw new Error('Post not found')

		const nextBlocks = [{ id: 'text-0', type: 'text' as const, data: { text: input.text } }]
		await db
			.update(schema.threadPosts)
			.set({
				contentBlocks: nextBlocks,
				plainText: blocksToPlainText(nextBlocks),
				editedAt: now,
				updatedAt: now,
			})
			.where(eq(schema.threadPosts.id, post.id))

		return { ok: true }
	})

export const startCloudRender = os
	.input(
		z.object({
			threadId: z.string().min(1),
			templateId: z.string().optional().default(DEFAULT_THREAD_TEMPLATE_ID),
			templateConfig: z.unknown().optional().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(eq(schema.threads.id, input.threadId), eq(schema.threads.userId, userId)),
		})
		if (!thread) throw new Error('Thread not found')

		const renderId = createId()
		const jobId = `job_${createId()}`

		// Materialize snapshot JSON into the bucket (renderer-remotion will fetch it via presigned URL).
		const snapshot = await buildThreadRenderSnapshot({
			threadId: thread.id,
			userId,
			jobId,
			templateId: input.templateId as ThreadTemplateId,
			templateConfig: input.templateConfig ?? thread.templateConfig ?? null,
		})

		await db.insert(schema.threadRenders).values({
			id: renderId,
			threadId: thread.id,
			userId,
			status: 'queued',
			jobId,
			templateId: input.templateId,
			templateConfig: (input.templateConfig ?? thread.templateConfig ?? null) as any,
			inputSnapshotKey: snapshot.key,
			outputVideoKey: null,
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		try {
			const { taskId } = await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.RENDER_THREAD,
				engine: 'renderer-remotion',
				targetType: 'thread',
				targetId: thread.id,
				mediaId: thread.id,
				purpose: TASK_KINDS.RENDER_THREAD,
				title: thread.title,
				jobId,
				payload: {
					threadId: thread.id,
					templateId: input.templateId,
					templateConfig: input.templateConfig ?? thread.templateConfig ?? null,
					composeMode: 'overlay-only',
				},
				options: {
					resourceType: 'thread',
					templateId: input.templateId,
					templateConfig: input.templateConfig ?? thread.templateConfig ?? undefined,
					composeMode: 'overlay-only',
				},
				buildManifest: ({ jobId }) => {
					return {
						jobId,
						mediaId: thread.id,
						purpose: TASK_KINDS.RENDER_THREAD,
						engine: 'renderer-remotion',
						createdAt: Date.now(),
						inputs: {
							videoKey: null,
							commentsKey: snapshot.key,
						},
						outputs: { videoKey: null },
						optionsSnapshot: {
							resourceType: 'thread',
							threadId: thread.id,
							templateId: input.templateId,
							composeMode: 'overlay-only',
						},
					}
				},
			})
			return { renderId, jobId, taskId }
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			await db
				.update(schema.threadRenders)
				.set({ status: 'failed', error: msg, updatedAt: new Date() })
				.where(eq(schema.threadRenders.id, renderId))
			throw e
		}
	})

export const getRenderStatus = os
	.input(
		z.object({
			renderId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const render = await db.query.threadRenders.findFirst({
			where: and(eq(schema.threadRenders.id, input.renderId), eq(schema.threadRenders.userId, userId)),
		})
		if (!render) throw new Error('Render not found')
		if (!render.jobId) throw new Error('Render jobId missing')

		const status = await getJobStatus(render.jobId)
		return { render, status }
	})

export const getCloudRenderStatus = os
	.input(
		z.object({
			jobId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const render = await db.query.threadRenders.findFirst({
			where: and(eq(schema.threadRenders.jobId, input.jobId), eq(schema.threadRenders.userId, userId)),
			columns: { id: true },
		})
		if (!render) throw new Error('Render job not found')

		return await getJobStatus(input.jobId)
	})
