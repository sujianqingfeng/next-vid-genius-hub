import { os } from '@orpc/server'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { deleteCloudArtifacts, getJobStatus } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
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

		const assetIds = new Set<string>()
		for (const p of posts) {
			if (p.authorAvatarAssetId) assetIds.add(p.authorAvatarAssetId)
			for (const b of p.contentBlocks ?? []) {
				if (!b || typeof b !== 'object') continue
				if (b.type === 'image' || b.type === 'video') {
					const id = (b as any).data?.assetId
					if (typeof id === 'string' && id) assetIds.add(id)
				}
				if (b.type === 'link') {
					const id = (b as any).data?.previewAssetId
					if (typeof id === 'string' && id) assetIds.add(id)
				}
			}
		}

		const referencedAssetIds = [...assetIds]
		const assets =
			referencedAssetIds.length > 0
				? await db
						.select()
						.from(schema.threadAssets)
						.where(
							and(
								eq(schema.threadAssets.userId, userId),
								inArray(schema.threadAssets.id, referencedAssetIds),
							),
						)
				: []

		return { thread, root, replies, assets }
	})

export const deleteById = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(eq(schema.threads.id, input.id), eq(schema.threads.userId, userId)),
		})
		if (!thread) throw new Error('Thread not found')

		// Best-effort cloud cleanup (render snapshots / outputs / orchestrator artifacts).
		try {
			const renders = await db.query.threadRenders.findMany({
				where: and(
					eq(schema.threadRenders.threadId, thread.id),
					eq(schema.threadRenders.userId, userId),
				),
				columns: { jobId: true, inputSnapshotKey: true, outputVideoKey: true },
			})

			const keys = new Set<string>()
			const artifactJobIds = new Set<string>()
			for (const r of renders) {
				if (r.inputSnapshotKey) keys.add(String(r.inputSnapshotKey))
				if (r.outputVideoKey) keys.add(String(r.outputVideoKey))
				if (r.jobId) artifactJobIds.add(String(r.jobId))
			}

			if (keys.size > 0 || artifactJobIds.size > 0) {
				await deleteCloudArtifacts({
					keys: [...keys],
					artifactJobIds: [...artifactJobIds],
				})
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			logger.warn('thread', `[thread.deleteById] cloud cleanup failed (continuing): ${msg}`)
		}

		await db.delete(schema.threadPosts).where(eq(schema.threadPosts.threadId, thread.id))
		await db
			.delete(schema.threadRenders)
			.where(eq(schema.threadRenders.threadId, thread.id))
		await db
			.delete(schema.tasks)
			.where(
				and(
					eq(schema.tasks.userId, userId),
					eq(schema.tasks.targetType, 'thread'),
					eq(schema.tasks.targetId, thread.id),
				),
			)
		await db
			.delete(schema.threads)
			.where(and(eq(schema.threads.id, thread.id), eq(schema.threads.userId, userId)))

		return { success: true }
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

		const externalMediaUrls = new Map<string, 'image' | 'video'>()
		for (const post of [draft.root, ...draft.replies]) {
			for (const b of post.contentBlocks ?? []) {
				if (!b || typeof b !== 'object') continue
				if (b.type !== 'image' && b.type !== 'video') continue
				const assetId = (b as any).data?.assetId
				if (typeof assetId !== 'string' || !assetId.startsWith('ext:')) continue
				const url = assetId.slice('ext:'.length).trim()
				if (!url) continue
				externalMediaUrls.set(url, b.type)
			}
		}

		const urlList = [...externalMediaUrls.keys()]
		const assetIdByUrl = new Map<string, string>()

		if (urlList.length > 0) {
			const existing = await db
				.select({
					id: schema.threadAssets.id,
					sourceUrl: schema.threadAssets.sourceUrl,
				})
				.from(schema.threadAssets)
				.where(
					and(
						eq(schema.threadAssets.userId, userId),
						inArray(schema.threadAssets.sourceUrl, urlList),
					),
				)

			for (const a of existing) {
				if (a.sourceUrl) assetIdByUrl.set(a.sourceUrl, a.id)
			}

			const toInsert = urlList
				.filter((u) => !assetIdByUrl.has(u))
				.map((u) => ({
					id: createId(),
					userId,
					kind: (externalMediaUrls.get(u) ?? 'image') as 'image' | 'video',
					sourceUrl: u,
					storageKey: null,
					contentType: null,
					bytes: null,
					width: null,
					height: null,
					durationMs: null,
					thumbnailAssetId: null,
					status: 'ready' as const,
					createdAt: now,
					updatedAt: now,
				}))

			for (const row of toInsert) assetIdByUrl.set(row.sourceUrl, row.id)

			const CHUNK_SIZE = 20
			for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
				await db.insert(schema.threadAssets).values(toInsert.slice(i, i + CHUNK_SIZE))
			}

			const resolveBlocks = (blocks: any[]) =>
				(blocks ?? []).map((b) => {
					if (!b || typeof b !== 'object') return b
					if (b.type !== 'image' && b.type !== 'video') return b
					const assetId = (b as any).data?.assetId
					if (typeof assetId !== 'string' || !assetId.startsWith('ext:')) return b
					const url = assetId.slice('ext:'.length).trim()
					const resolved = assetIdByUrl.get(url)
					if (!resolved) return b
					return { ...b, data: { ...(b as any).data, assetId: resolved } }
				})

			draft.root.contentBlocks = resolveBlocks(draft.root.contentBlocks as any) as any
			for (const r of draft.replies) {
				r.contentBlocks = resolveBlocks(r.contentBlocks as any) as any
			}
		}

		const sourceIdClause = draft.sourceId
			? eq(schema.threads.sourceId, draft.sourceId)
			: isNull(schema.threads.sourceId)

		const existing = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.userId, userId),
				eq(schema.threads.source, 'x'),
				sourceIdClause,
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
				// Existing thread: keep user edits intact, but backfill media blocks from
				// the latest import draft.
				const draftBySourcePostId = new Map<string, any>()
				for (const p of [draft.root, ...draft.replies]) {
					if (p.sourcePostId) draftBySourcePostId.set(p.sourcePostId, p)
				}

				const existingPosts = await db
					.select({
						id: schema.threadPosts.id,
						sourcePostId: schema.threadPosts.sourcePostId,
						contentBlocks: schema.threadPosts.contentBlocks,
					})
					.from(schema.threadPosts)
					.where(eq(schema.threadPosts.threadId, threadId))

				for (const p of existingPosts) {
					const sourcePostId = p.sourcePostId ?? null
					if (!sourcePostId) continue
					const draftPost = draftBySourcePostId.get(sourcePostId)
					if (!draftPost) continue

					const draftMediaBlocks = (draftPost.contentBlocks ?? []).filter(
						(b: any) => b?.type && b.type !== 'text',
					)
					if (draftMediaBlocks.length === 0) continue

					const currentBlocks = (p.contentBlocks ?? []) as any[]
					const nextBlocks = [...currentBlocks]

					const hasBlock = (candidate: any) =>
						nextBlocks.some((b: any) => {
							if (!b || typeof b !== 'object') return false
							if (b.type !== candidate?.type) return false
							if (b.type === 'image' || b.type === 'video') {
								return b.data?.assetId && b.data.assetId === candidate?.data?.assetId
							}
							if (b.type === 'link') return b.data?.url && b.data.url === candidate?.data?.url
							return b.id && b.id === candidate?.id
						})

					for (const mb of draftMediaBlocks) {
						if (!hasBlock(mb)) nextBlocks.push(mb)
					}

					if (nextBlocks.length !== currentBlocks.length) {
						await db
							.update(schema.threadPosts)
							.set({ contentBlocks: nextBlocks, updatedAt: now })
							.where(eq(schema.threadPosts.id, p.id))
					}
				}

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

		const currentBlocks = (post.contentBlocks ?? []) as any[]
		let updated = false
		const nextBlocks = currentBlocks.map((b) => {
			if (!updated && b?.type === 'text') {
				updated = true
				return { ...b, data: { ...b.data, text: input.text } }
			}
			return b
		})
		if (!updated) {
			nextBlocks.unshift({ id: 'text-0', type: 'text' as const, data: { text: input.text } })
		}
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
