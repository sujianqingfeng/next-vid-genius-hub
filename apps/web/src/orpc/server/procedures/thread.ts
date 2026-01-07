import { os } from '@orpc/server'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/features/auth/types'
import { deleteCloudArtifacts, getJobStatus } from '~/lib/infra/cloudflare'
import {
	presignGetByKey,
	presignPutAndGetByKey,
	remoteKeyExists,
} from '~/lib/infra/cloudflare/storage'
import { getDb, schema } from '~/lib/infra/db'
import { enqueueCloudTask } from '~/lib/features/job/enqueue'
import { TASK_KINDS } from '~/lib/features/job/task'
import { logger } from '~/lib/infra/logger'
import { resolveSuccessProxy } from '~/lib/infra/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/infra/proxy/utils'
import { createId } from '~/lib/shared/utils/id'
import {
	buildThreadPostsInsertFromDraft,
	buildThreadInsertFromDraft,
	parseXThreadImportDraft,
} from '~/lib/domain/thread/adapters/x'
import { blocksToPlainText } from '~/lib/domain/thread/utils/plain-text'
import { buildThreadRenderSnapshot } from '~/lib/domain/thread/render-snapshot'
import {
	DEFAULT_THREAD_TEMPLATE_ID,
	THREAD_TEMPLATES,
} from '@app/remotion-project/thread-templates'
import {
	translateAllThreadPosts,
	translateThreadPost,
} from '~/lib/domain/thread/server/translate'
import { collectThreadTemplateAssetIds } from '~/lib/domain/thread/template-assets'

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

	const threadIds = items.map((t) => String(t.id))
	if (threadIds.length === 0) return { items: [] as any[] }

	const posts = await db
		.select({
			threadId: schema.threadPosts.threadId,
			contentBlocks: schema.threadPosts.contentBlocks,
			depth: schema.threadPosts.depth,
			createdAt: schema.threadPosts.createdAt,
		})
		.from(schema.threadPosts)
		.where(inArray(schema.threadPosts.threadId, threadIds))
		.orderBy(
			asc(schema.threadPosts.threadId),
			asc(schema.threadPosts.depth),
			asc(schema.threadPosts.createdAt),
		)

		type PreviewCandidate = {
			kind: 'image' | 'video' | 'linkPreview'
			assetId: string
			posterUrl?: string | null
		}

	const previewCandidatesByThreadId = new Map<string, PreviewCandidate[]>()
	for (const p of posts as any[]) {
		const threadId = String(p.threadId)
		const current = previewCandidatesByThreadId.get(threadId) ?? []
		if (current.length >= 3) continue

		const blocks = (p.contentBlocks ?? []) as any[]
		for (const b of blocks) {
			if (!b || typeof b !== 'object') continue
			if (current.length >= 3) break

				if (b.type === 'image' || b.type === 'video') {
					const assetId = String((b as any).data?.assetId ?? '').trim()
					if (!assetId) continue
					if (current.some((x) => x.assetId === assetId)) continue
					const posterUrl =
						b.type === 'video' ? String((b as any).data?.posterUrl ?? '') : ''
					current.push({
						kind: b.type,
						assetId,
						posterUrl: posterUrl.trim() || null,
					})
					continue
				}
			if (b.type === 'link') {
				const assetId = String((b as any).data?.previewAssetId ?? '').trim()
				if (!assetId) continue
				if (current.some((x) => x.assetId === assetId)) continue
				current.push({ kind: 'linkPreview', assetId })
				continue
			}
		}

		if (current.length > 0) previewCandidatesByThreadId.set(threadId, current)
	}

	const primaryAssetIds = [
		...new Set(
			[...previewCandidatesByThreadId.values()]
				.flat()
				.map((c) => c.assetId),
		),
	]

	const primaryAssets =
		primaryAssetIds.length > 0
			? await db
					.select({
						id: schema.threadAssets.id,
						kind: schema.threadAssets.kind,
						storageKey: schema.threadAssets.storageKey,
						sourceUrl: schema.threadAssets.sourceUrl,
						thumbnailAssetId: schema.threadAssets.thumbnailAssetId,
					})
					.from(schema.threadAssets)
					.where(
						and(
							eq(schema.threadAssets.userId, userId),
							inArray(schema.threadAssets.id, primaryAssetIds),
						),
					)
			: []

	const primaryAssetById = new Map<string, (typeof primaryAssets)[number]>()
	const thumbnailAssetIds: string[] = []
	for (const a of primaryAssets) {
		primaryAssetById.set(String(a.id), a)
		if (a.kind === 'video' && a.thumbnailAssetId) {
			thumbnailAssetIds.push(String(a.thumbnailAssetId))
		}
	}

	const thumbnails =
		thumbnailAssetIds.length > 0
			? await db
					.select({
						id: schema.threadAssets.id,
						storageKey: schema.threadAssets.storageKey,
						sourceUrl: schema.threadAssets.sourceUrl,
					})
					.from(schema.threadAssets)
					.where(
						and(
							eq(schema.threadAssets.userId, userId),
							inArray(schema.threadAssets.id, thumbnailAssetIds),
						),
					)
			: []

		const urlByAssetId = new Map<string, string>()
		const presignRows = [...primaryAssets, ...thumbnails].filter(
			(a) => a?.storageKey || a?.sourceUrl,
		)
	await Promise.all(
		presignRows.map(async (a) => {
			const id = String(a.id)
			if (urlByAssetId.has(id)) return
			if (a.storageKey) {
				try {
					const url = await presignGetByKey(String(a.storageKey))
					urlByAssetId.set(id, url)
					return
				} catch {}
			}
			const sourceUrl = a.sourceUrl ? String(a.sourceUrl) : ''
			if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
				urlByAssetId.set(id, sourceUrl)
			}
		}),
	)

	const itemsWithPreview = items.map((thread: any) => {
		const candidates = previewCandidatesByThreadId.get(String(thread.id)) ?? []
		const previewMedia = candidates
			.map((c) => {
				if (c.kind !== 'video') {
					const url = urlByAssetId.get(c.assetId) ?? null
					return url ? { kind: c.kind, url } : null
				}

				const video = primaryAssetById.get(c.assetId)
					const thumbId = video?.thumbnailAssetId
						? String(video.thumbnailAssetId)
						: null
					const url = (thumbId && urlByAssetId.get(thumbId)) ?? null
					if (url) return { kind: c.kind, url }

					const posterUrl = String(c.posterUrl ?? '').trim()
					if (
						posterUrl.startsWith('http://') ||
						posterUrl.startsWith('https://')
					) {
						return { kind: c.kind, url: posterUrl }
					}

					return { kind: c.kind, url: null }
				})
				.filter(Boolean)

		const hasVideo = candidates.some((c) => c.kind === 'video')
		return { ...thread, previewMedia, hasVideo }
	})

	return { items: itemsWithPreview }
})

export const byId = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.id),
				eq(schema.threads.userId, userId),
			),
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

		if (
			thread.templateConfig &&
			typeof thread.templateConfig === 'object' &&
			!Array.isArray(thread.templateConfig) &&
			(thread.templateConfig as any).version === 1
		) {
			for (const id of collectThreadTemplateAssetIds(thread.templateConfig as any)) {
				assetIds.add(id)
			}
		}

		const referencedAssetIds = [...assetIds]
		const assetRows =
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

		const ingestTasks =
			referencedAssetIds.length > 0
				? await db
						.select({
							id: schema.tasks.id,
							targetId: schema.tasks.targetId,
							jobId: schema.tasks.jobId,
							status: schema.tasks.status,
							progress: schema.tasks.progress,
							createdAt: schema.tasks.createdAt,
						})
						.from(schema.tasks)
						.where(
							and(
								eq(schema.tasks.userId, userId),
								eq(schema.tasks.kind, TASK_KINDS.THREAD_ASSET_INGEST),
								inArray(schema.tasks.targetId, referencedAssetIds),
							),
						)
						.orderBy(desc(schema.tasks.createdAt))
				: []

		const ingestTaskByAssetId = new Map<
			string,
			{
				id: string
				jobId: string | null
				status: string | null
				progress: number | null
				createdAt: Date
			}
		>()
		for (const t of ingestTasks) {
			const targetId = String(t.targetId ?? '').trim()
			if (!targetId) continue
			if (ingestTaskByAssetId.has(targetId)) continue
			ingestTaskByAssetId.set(targetId, {
				id: String(t.id),
				jobId: t.jobId ? String(t.jobId) : null,
				status: t.status ? String(t.status) : null,
				progress:
					typeof t.progress === 'number' && Number.isFinite(t.progress)
						? Math.trunc(t.progress)
						: null,
				createdAt: t.createdAt as Date,
			})
		}

		const assets = await Promise.all(
			assetRows.map(async (a: any) => {
				let renderUrl: string | null = null
				if (a?.storageKey) {
					try {
						renderUrl = await presignGetByKey(String(a.storageKey))
					} catch {}
				}
				const ingestTask =
					ingestTaskByAssetId.get(String(a?.id ?? '')) ?? null
				return { ...a, renderUrl, ingestTask }
			}),
		)

		const audioAssetId = thread.audioAssetId
			? String(thread.audioAssetId)
			: null
		const audioAsset = audioAssetId
			? await db.query.threadAssets.findFirst({
					where: and(
						eq(schema.threadAssets.id, audioAssetId),
						eq(schema.threadAssets.userId, userId),
					),
				})
			: null

		let audioUrl: string | null = null
		if (audioAsset?.storageKey) {
			try {
				audioUrl = await presignGetByKey(String(audioAsset.storageKey))
			} catch {
				audioUrl = audioAsset.sourceUrl ? String(audioAsset.sourceUrl) : null
			}
		} else if (audioAsset?.sourceUrl) {
			audioUrl = String(audioAsset.sourceUrl)
		}

		const audioAssets = await db
			.select()
			.from(schema.threadAssets)
			.where(
				and(
					eq(schema.threadAssets.userId, userId),
					eq(schema.threadAssets.kind, 'audio'),
				),
			)
			.orderBy(desc(schema.threadAssets.createdAt))
			.limit(20)

		return {
			thread,
			root,
			replies,
			assets,
			audio: audioAsset
				? {
						asset: audioAsset,
						url: audioUrl,
					}
				: null,
			audioAssets,
		}
	})

const MAX_THREAD_ASSET_IDS_QUERY = 200

export const assetsByIds = os
	.input(
		z.object({
			ids: z.array(z.string().min(1)).min(1).max(MAX_THREAD_ASSET_IDS_QUERY),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const ids = [
			...new Set(input.ids.map((x) => String(x).trim()).filter(Boolean)),
		]
		if (ids.length === 0) return { assets: [] as any[] }

		const assetRows = await db
			.select()
			.from(schema.threadAssets)
			.where(
				and(
					eq(schema.threadAssets.userId, userId),
					inArray(schema.threadAssets.id, ids),
				),
			)

		const assets = await Promise.all(
			assetRows.map(async (a: any) => {
				let renderUrl: string | null = null
				if (a?.storageKey) {
					try {
						renderUrl = await presignGetByKey(String(a.storageKey))
					} catch {}
				}
				return { ...a, renderUrl }
			}),
		)

		return { assets }
	})

export const translatePost = os
	.input(
		z.object({
			threadId: z.string().min(1),
			postId: z.string().min(1),
			targetLocale: z.enum(['zh-CN']).optional().default('zh-CN'),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		return await translateThreadPost({
			userId,
			threadId: input.threadId,
			postId: input.postId,
			targetLocale: input.targetLocale,
		})
	})

export const translateAllPosts = os
	.input(
		z.object({
			threadId: z.string().min(1),
			targetLocale: z.enum(['zh-CN']).optional().default('zh-CN'),
			maxPosts: z.number().int().min(1).max(500).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		return await translateAllThreadPosts({
			userId,
			threadId: input.threadId,
			targetLocale: input.targetLocale,
			maxPosts: input.maxPosts,
		})
	})

export const deleteById = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.id),
				eq(schema.threads.userId, userId),
			),
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
			logger.warn(
				'thread',
				`[thread.deleteById] cloud cleanup failed (continuing): ${msg}`,
			)
		}

		await db
			.delete(schema.threadPosts)
			.where(eq(schema.threadPosts.threadId, thread.id))
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
			.where(
				and(
					eq(schema.threads.id, thread.id),
					eq(schema.threads.userId, userId),
				),
			)

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
					status: 'pending' as const,
					createdAt: now,
					updatedAt: now,
				}))

			for (const row of toInsert) assetIdByUrl.set(row.sourceUrl, row.id)

			// D1 has a low bind-parameter limit per statement; keep batch size small
			// to avoid "too many SQL variables" errors (14 columns per row).
			const CHUNK_SIZE = 5
			for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
				await db
					.insert(schema.threadAssets)
					.values(toInsert.slice(i, i + CHUNK_SIZE))
			}

			const resolveBlocks = (blocks: any[]) =>
				(blocks ?? []).map((b) => {
					if (!b || typeof b !== 'object') return b
					if (b.type !== 'image' && b.type !== 'video') return b
					const assetId = (b as any).data?.assetId
					if (typeof assetId !== 'string' || !assetId.startsWith('ext:'))
						return b
					const url = assetId.slice('ext:'.length).trim()
					const resolved = assetIdByUrl.get(url)
					if (!resolved) return b
					return { ...b, data: { ...(b as any).data, assetId: resolved } }
				})

			draft.root.contentBlocks = resolveBlocks(
				draft.root.contentBlocks as any,
			) as any
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
			if (!existing.sourceUrl && draft.sourceUrl)
				updates.sourceUrl = draft.sourceUrl
			await db
				.update(schema.threads)
				.set(updates)
				.where(eq(schema.threads.id, existing.id))
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

				const existingAssetIds = new Set<string>()
				for (const p of existingPosts) {
					const currentBlocks = (p.contentBlocks ?? []) as any[]
					for (const b of currentBlocks) {
						if (!b || typeof b !== 'object') continue
						if (b.type !== 'image' && b.type !== 'video') continue
						const assetId = b.data?.assetId
						if (typeof assetId === 'string' && assetId) existingAssetIds.add(assetId)
					}
				}

				const assetMetaRows =
					existingAssetIds.size > 0
						? await db
								.select({
									id: schema.threadAssets.id,
									sourceUrl: schema.threadAssets.sourceUrl,
									contentType: schema.threadAssets.contentType,
								})
								.from(schema.threadAssets)
								.where(
									and(
										eq(schema.threadAssets.userId, userId),
										inArray(schema.threadAssets.id, [...existingAssetIds]),
									),
								)
						: []

				const assetMetaById = new Map<
					string,
					{ sourceUrl: string | null; contentType: string | null }
				>()
				for (const a of assetMetaRows) {
					assetMetaById.set(String(a.id), {
						sourceUrl: a.sourceUrl ? String(a.sourceUrl) : null,
						contentType: a.contentType ? String(a.contentType) : null,
					})
				}

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
								return (
									b.data?.assetId && b.data.assetId === candidate?.data?.assetId
								)
							}
							if (b.type === 'link')
								return b.data?.url && b.data.url === candidate?.data?.url
							return b.id && b.id === candidate?.id
						})

					for (const mb of draftMediaBlocks) {
						let replaced = false
						if (mb?.type === 'video') {
							const posterUrl = String(mb?.data?.posterUrl ?? '').trim()
							if (posterUrl) {
								const existingIdx = nextBlocks.findIndex((b: any) => {
									if (!b || typeof b !== 'object') return false
									if (b.type !== 'video') return false
									const existingPoster = String(b?.data?.posterUrl ?? '').trim()
									return existingPoster === posterUrl
								})

								if (existingIdx >= 0) {
									const existing = nextBlocks[existingIdx]
									const existingAssetId = String(existing?.data?.assetId ?? '').trim()
									const meta = existingAssetId
										? (assetMetaById.get(existingAssetId) ?? null)
										: null
									const contentType = String(meta?.contentType ?? '').trim()
									const sourceUrl = String(meta?.sourceUrl ?? '').trim()
									const looksLikeM3u8 =
										contentType === 'application/x-mpegURL' ||
										sourceUrl.endsWith('.m3u8') ||
										sourceUrl.includes('.m3u8?')
									const looksLikeAmplifyInitMp4 =
										sourceUrl.includes('video.twimg.com/amplify_video/') &&
										sourceUrl.includes('/vid/') &&
										sourceUrl.endsWith('.mp4')

									if (looksLikeM3u8 || looksLikeAmplifyInitMp4) {
										nextBlocks[existingIdx] = { ...mb, id: existing?.id ?? mb.id }
										replaced = true
									}
								}
							}
						}

						if (!replaced && !hasBlock(mb)) nextBlocks.push(mb)
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
			await db
				.insert(schema.threadPosts)
				.values(postRows.slice(i, i + CHUNK_SIZE))
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
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		const post = await db.query.threadPosts.findFirst({
			where: and(
				eq(schema.threadPosts.id, input.postId),
				eq(schema.threadPosts.threadId, thread.id),
			),
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
			nextBlocks.unshift({
				id: 'text-0',
				type: 'text' as const,
				data: { text: input.text },
			})
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

export const deletePost = os
	.input(
		z.object({
			threadId: z.string().min(1),
			postId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		const post = await db.query.threadPosts.findFirst({
			where: and(
				eq(schema.threadPosts.id, input.postId),
				eq(schema.threadPosts.threadId, thread.id),
			),
			columns: { id: true, role: true, sourcePostId: true },
		})
		if (!post) throw new Error('Post not found')
		if (post.role === 'root') throw new Error('Root post cannot be deleted')

		const deletedPostIds = new Set<string>([post.id])

		// Best-effort: if imported from X, delete the whole reply subtree.
		const rootSourcePostId = post.sourcePostId ? String(post.sourcePostId) : null
		if (rootSourcePostId) {
			const rows = await db
				.select({
					id: schema.threadPosts.id,
					sourcePostId: schema.threadPosts.sourcePostId,
					parentSourcePostId: schema.threadPosts.parentSourcePostId,
				})
				.from(schema.threadPosts)
				.where(eq(schema.threadPosts.threadId, thread.id))

			const childrenByParentSourcePostId = new Map<string, typeof rows>()
			for (const r of rows) {
				const parent = r.parentSourcePostId ? String(r.parentSourcePostId) : null
				if (!parent) continue
				const bucket = childrenByParentSourcePostId.get(parent)
				if (bucket) {
					bucket.push(r)
				} else {
					childrenByParentSourcePostId.set(parent, [r])
				}
			}

			const visitedSourcePostIds = new Set<string>([rootSourcePostId])
			const queue: string[] = [rootSourcePostId]
			while (queue.length > 0) {
				const current = queue.shift()
				if (!current) continue
				const children = childrenByParentSourcePostId.get(current) ?? []
				for (const child of children) {
					deletedPostIds.add(child.id)
					const childSourcePostId = child.sourcePostId
						? String(child.sourcePostId)
						: null
					if (childSourcePostId && !visitedSourcePostIds.has(childSourcePostId)) {
						visitedSourcePostIds.add(childSourcePostId)
						queue.push(childSourcePostId)
					}
				}
			}
		}

		const ids = [...deletedPostIds]
		const CHUNK_SIZE = 50
		for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
			await db
				.delete(schema.threadPosts)
				.where(
					and(
						eq(schema.threadPosts.threadId, thread.id),
						inArray(schema.threadPosts.id, ids.slice(i, i + CHUNK_SIZE)),
					),
				)
		}

		return { ok: true, deletedCount: ids.length, deletedPostIds: ids }
	})

export const ingestAssets = os
	.input(
		z.object({
			threadId: z.string().min(1),
			maxAssetsPerRun: z.number().int().min(1).max(25).optional().default(5),
			proxyId: z.string().nullable().optional().default(null),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const now = new Date()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		const posts = await db
			.select({
				id: schema.threadPosts.id,
				authorAvatarAssetId: schema.threadPosts.authorAvatarAssetId,
				contentBlocks: schema.threadPosts.contentBlocks,
			})
			.from(schema.threadPosts)
			.where(eq(schema.threadPosts.threadId, thread.id))

		const requestedProxyId =
			typeof input.proxyId === 'string' && input.proxyId.trim()
				? input.proxyId.trim()
				: null
		const strictProxy = true as const
		const resolvedProxy = requestedProxyId
			? await resolveSuccessProxy({ db, requestedProxyId })
			: null
		const proxyPayload = resolvedProxy ? toProxyJobPayload(resolvedProxy.proxyRecord) : null

		function extractExternalUrl(value: unknown): string | null {
			if (typeof value !== 'string') return null
			const v = value.trim()
			if (!v) return null
			if (v.startsWith('ext:')) {
				const url = v.slice('ext:'.length).trim()
				if (url.startsWith('http://') || url.startsWith('https://')) return url
				return null
			}
			if (v.startsWith('http://') || v.startsWith('https://')) return v
			return null
		}

		const ensured = new Map<string, string>()
		async function ensureAssetForExternalUrl(
			kind: 'image' | 'video' | 'avatar' | 'linkPreview',
			url: string,
		): Promise<string> {
			const key = `${kind}|${url}`
			const cached = ensured.get(key)
			if (cached) return cached

			const existing = await db.query.threadAssets.findFirst({
				where: and(
					eq(schema.threadAssets.userId, userId),
					eq(schema.threadAssets.kind, kind),
					eq(schema.threadAssets.sourceUrl, url),
				),
				columns: { id: true },
			})
			if (existing?.id) {
				const id = String(existing.id)
				ensured.set(key, id)
				return id
			}

			const id = createId()
			await db.insert(schema.threadAssets).values({
				id,
				userId,
				kind,
				sourceUrl: url,
				storageKey: null,
				contentType: null,
				bytes: null,
				width: null,
				height: null,
				durationMs: null,
				thumbnailAssetId: null,
				status: 'pending',
				createdAt: now,
				updatedAt: now,
			})
			ensured.set(key, id)
			return id
		}

		const materializedAssetIds = new Set<string>()
		for (const p of posts) {
			let changed = false
			let nextAuthorAvatarAssetId: string | null = p.authorAvatarAssetId

			const avatarUrl = extractExternalUrl(p.authorAvatarAssetId)
			if (avatarUrl) {
				nextAuthorAvatarAssetId = await ensureAssetForExternalUrl(
					'avatar',
					avatarUrl,
				)
				materializedAssetIds.add(nextAuthorAvatarAssetId)
				changed = true
			}

			const currentBlocks = (p.contentBlocks ?? []) as any[]
			const nextBlocks: any[] = []
			for (const b of currentBlocks) {
				if (!b || typeof b !== 'object') {
					nextBlocks.push(b)
					continue
				}
				if (b.type === 'image' || b.type === 'video') {
					const rawId = (b as any).data?.assetId
					const url = extractExternalUrl(rawId)
					if (url) {
						const kind = b.type === 'image' ? 'image' : 'video'
						const id = await ensureAssetForExternalUrl(kind, url)
						materializedAssetIds.add(id)
						nextBlocks.push({ ...b, data: { ...(b as any).data, assetId: id } })
						changed = true
						continue
					}
				}
				if (b.type === 'link') {
					const rawId = (b as any).data?.previewAssetId
					const url = extractExternalUrl(rawId)
					if (url) {
						const id = await ensureAssetForExternalUrl('linkPreview', url)
						materializedAssetIds.add(id)
						nextBlocks.push({
							...b,
							data: { ...(b as any).data, previewAssetId: id },
						})
						changed = true
						continue
					}
				}
				nextBlocks.push(b)
			}

			if (!changed) continue

			await db
				.update(schema.threadPosts)
				.set({
					authorAvatarAssetId: nextAuthorAvatarAssetId,
					contentBlocks: nextBlocks as any,
					updatedAt: now,
				})
				.where(eq(schema.threadPosts.id, p.id))
		}

		const assetIds = new Set<string>()
		for (const p of posts) {
			if (p.authorAvatarAssetId && !extractExternalUrl(p.authorAvatarAssetId)) {
				assetIds.add(p.authorAvatarAssetId)
			}
			for (const b of p.contentBlocks ?? []) {
				if (!b || typeof b !== 'object') continue
				if (b.type === 'image' || b.type === 'video') {
					const id = (b as any).data?.assetId
					if (typeof id === 'string' && id && !extractExternalUrl(id))
						assetIds.add(id)
				}
				if (b.type === 'link') {
					const id = (b as any).data?.previewAssetId
					if (typeof id === 'string' && id && !extractExternalUrl(id))
						assetIds.add(id)
				}
			}
		}

		const candidateIds = [...new Set([...assetIds, ...materializedAssetIds])]
		if (candidateIds.length === 0) {
			return { queued: 0, effectiveProxyId: resolvedProxy?.proxyId ?? null }
		}

		const candidates = await db
			.select({
				id: schema.threadAssets.id,
				kind: schema.threadAssets.kind,
				sourceUrl: schema.threadAssets.sourceUrl,
				storageKey: schema.threadAssets.storageKey,
				contentType: schema.threadAssets.contentType,
				bytes: schema.threadAssets.bytes,
				status: schema.threadAssets.status,
			})
			.from(schema.threadAssets)
			.where(
				and(
					eq(schema.threadAssets.userId, userId),
					inArray(schema.threadAssets.id, candidateIds),
				),
			)

		const MIN_TWITTER_VIDEO_BYTES = 1_000_000
		const looksLikeCorruptTwitterVideo = (a: any) => {
			if (a?.kind !== 'video') return false
			if (a?.status !== 'ready') return false
			if (!a?.storageKey) return false
			const src = typeof a.sourceUrl === 'string' ? a.sourceUrl.trim() : ''
			if (!src.includes('video.twimg.com')) return false
			const bytes = typeof a.bytes === 'number' && Number.isFinite(a.bytes) ? a.bytes : null
			if (bytes == null) return false
			return bytes > 0 && bytes < MIN_TWITTER_VIDEO_BYTES
		}

		const toQueue = candidates
			.filter((a) => {
				const src = typeof a.sourceUrl === 'string' ? a.sourceUrl.trim() : ''
				if (!src) return false
				if (looksLikeCorruptTwitterVideo(a)) return true
				return !a.storageKey && (a.status === 'pending' || a.status === 'failed')
			})
			.slice(0, input.maxAssetsPerRun)

		for (const a of toQueue) {
			const assetId = String(a.id)
			const url = String(a.sourceUrl).trim()

			// Reset assets to pending when re-queued (including corrupt partial downloads).
			if (a.status !== 'pending' || looksLikeCorruptTwitterVideo(a)) {
				const reset: Partial<typeof schema.threadAssets.$inferInsert> = {
					status: 'pending',
					updatedAt: now,
				}
				if (looksLikeCorruptTwitterVideo(a)) {
					reset.storageKey = null
					reset.contentType = null
					reset.bytes = null
				}
				await db
					.update(schema.threadAssets)
					.set(reset)
					.where(eq(schema.threadAssets.id, assetId))
			}

			await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.THREAD_ASSET_INGEST,
				engine: 'media-downloader',
				targetType: 'thread',
				targetId: assetId,
				mediaId: assetId,
				purpose: TASK_KINDS.THREAD_ASSET_INGEST,
				title: thread.id,
				payload: {
					threadId: thread.id,
					assetId,
					url,
					proxyId: resolvedProxy?.proxyId ?? null,
				},
				options: {
					task: 'thread-asset',
					strictProxy,
					assetId,
					url,
					proxyId: resolvedProxy?.proxyId ?? null,
					proxy: proxyPayload ?? undefined,
				},
				buildManifest: ({ jobId }) => {
					return {
						jobId,
						mediaId: assetId,
						purpose: TASK_KINDS.THREAD_ASSET_INGEST,
						engine: 'media-downloader',
						createdAt: Date.now(),
						inputs: {},
						optionsSnapshot: {
							threadId: thread.id,
							assetId,
							url,
							strictProxy,
							proxyId: resolvedProxy?.proxyId ?? null,
						},
					}
				},
			})
		}

		return { queued: toQueue.length, effectiveProxyId: resolvedProxy?.proxyId ?? null }
	})

const DEFAULT_MAX_THREAD_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024

function normalizeContentType(value: string): string {
	return value.split(';')[0]?.trim() || ''
}

function extForAudioContentType(contentType: string): string {
	switch (contentType) {
		case 'audio/mpeg':
		case 'audio/mp3':
			return '.mp3'
		case 'audio/mp4':
			return '.m4a'
		case 'audio/wav':
		case 'audio/x-wav':
			return '.wav'
		case 'audio/aac':
			return '.aac'
		case 'audio/ogg':
			return '.ogg'
		case 'audio/webm':
			return '.webm'
		case 'audio/flac':
			return '.flac'
		default:
			return ''
	}
}

export const audio = os.router({
	createUpload: os
		.input(
			z.object({
				threadId: z.string().min(1),
				contentType: z.string().min(1),
				bytes: z.number().int().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as RequestContext
			const userId = ctx.auth.user!.id
			const db = await getDb()

			const thread = await db.query.threads.findFirst({
				where: and(
					eq(schema.threads.id, input.threadId),
					eq(schema.threads.userId, userId),
				),
				columns: { id: true },
			})
			if (!thread) throw new Error('Thread not found')

			const contentType = normalizeContentType(input.contentType).toLowerCase()
			if (!contentType.startsWith('audio/'))
				throw new Error('Unsupported audio content-type')
			if (input.bytes > DEFAULT_MAX_THREAD_AUDIO_UPLOAD_BYTES) {
				throw new Error(
					`Audio too large: ${input.bytes} bytes (max ${DEFAULT_MAX_THREAD_AUDIO_UPLOAD_BYTES})`,
				)
			}

			const assetId = createId()
			const ext = extForAudioContentType(contentType)
			const storageKey = `thread-assets/${assetId}${ext}`

			const { putUrl, getUrl } = await presignPutAndGetByKey(
				storageKey,
				contentType,
			)

			await db.insert(schema.threadAssets).values({
				id: assetId,
				userId,
				kind: 'audio',
				sourceUrl: null,
				storageKey,
				contentType,
				bytes: input.bytes,
				width: null,
				height: null,
				durationMs: null,
				thumbnailAssetId: null,
				status: 'pending',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			return { assetId, storageKey, putUrl, getUrl }
		}),

	completeUpload: os
		.input(
			z.object({
				threadId: z.string().min(1),
				assetId: z.string().min(1),
				bytes: z.number().int().min(1),
				durationMs: z
					.number()
					.int()
					.min(1)
					.max(24 * 60 * 60 * 1000),
			}),
		)
		.handler(async ({ input, context }) => {
			const ctx = context as RequestContext
			const userId = ctx.auth.user!.id
			const db = await getDb()

			const thread = await db.query.threads.findFirst({
				where: and(
					eq(schema.threads.id, input.threadId),
					eq(schema.threads.userId, userId),
				),
				columns: { id: true },
			})
			if (!thread) throw new Error('Thread not found')

			const asset = await db.query.threadAssets.findFirst({
				where: and(
					eq(schema.threadAssets.id, input.assetId),
					eq(schema.threadAssets.userId, userId),
					eq(schema.threadAssets.kind, 'audio'),
				),
			})
			if (!asset) throw new Error('Audio asset not found')
			if (!asset.storageKey) throw new Error('Audio storageKey missing')

			let exists = false
			for (const delayMs of [0, 200, 500, 1000]) {
				if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
				exists = await remoteKeyExists(String(asset.storageKey))
				if (exists) break
			}
			if (!exists) throw new Error('Uploaded audio not found in storage yet')

			await db
				.update(schema.threadAssets)
				.set({
					bytes: input.bytes,
					durationMs: input.durationMs,
					status: 'ready',
					updatedAt: new Date(),
				})
				.where(eq(schema.threadAssets.id, asset.id))

			return { success: true }
		}),
})

export const setAudioAsset = os
	.input(
		z.object({
			threadId: z.string().min(1),
			audioAssetId: z.string().min(1).nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		const audioAssetId = input.audioAssetId ? String(input.audioAssetId) : null

		if (audioAssetId) {
			const audioAsset = await db.query.threadAssets.findFirst({
				where: and(
					eq(schema.threadAssets.id, audioAssetId),
					eq(schema.threadAssets.userId, userId),
					eq(schema.threadAssets.kind, 'audio'),
				),
			})
			if (!audioAsset) throw new Error('Audio asset not found')
			if (audioAsset.status !== 'ready')
				throw new Error('Audio asset is not ready yet')
		}

		await db
			.update(schema.threads)
			.set({ audioAssetId, updatedAt: new Date() })
			.where(
				and(
					eq(schema.threads.id, input.threadId),
					eq(schema.threads.userId, userId),
				),
			)

		return { success: true }
	})

const MAX_THREAD_TEMPLATE_CONFIG_BYTES = 64 * 1024

export const setTemplate = os
	.input(
		z.object({
			threadId: z.string().min(1),
			templateId: z.string().optional().nullable(),
			templateConfig: z.unknown().optional().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const isPlainObject = (value: unknown): value is Record<string, unknown> =>
			Boolean(value) && typeof value === 'object' && !Array.isArray(value)

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
			columns: { id: true },
		})
		if (!thread) throw new Error('Thread not found')

		if (input.templateId != null) {
			const id = String(input.templateId)
			if (!(id in THREAD_TEMPLATES))
				throw new Error(`Unknown templateId: ${id}`)
		}

		if (input.templateConfig !== undefined && input.templateConfig !== null) {
			if (
				!isPlainObject(input.templateConfig) ||
				input.templateConfig.version !== 1
			) {
				throw new Error(
					'templateConfig must be an object with version: 1 (v1 only)',
				)
			}

			let json = ''
			try {
				json = JSON.stringify(input.templateConfig)
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				throw new Error(`Invalid templateConfig JSON: ${msg}`)
			}
			if (json.length > MAX_THREAD_TEMPLATE_CONFIG_BYTES) {
				throw new Error(
					`templateConfig too large: ${json.length} bytes (max ${MAX_THREAD_TEMPLATE_CONFIG_BYTES})`,
				)
			}
		}

		if (input.templateId === undefined && input.templateConfig === undefined) {
			throw new Error('No template updates provided')
		}

		const update: Record<string, unknown> = { updatedAt: new Date() }
		if (input.templateId !== undefined) update.templateId = input.templateId
		if (input.templateConfig !== undefined)
			update.templateConfig = input.templateConfig

		await db
			.update(schema.threads)
			.set(update as any)
			.where(
				and(
					eq(schema.threads.id, input.threadId),
					eq(schema.threads.userId, userId),
				),
			)

		return { success: true }
	})

export const startCloudRender = os
	.input(
		z.object({
			threadId: z.string().min(1),
			templateId: z.string().optional(),
			templateConfig: z.unknown().optional().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const thread = await db.query.threads.findFirst({
			where: and(
				eq(schema.threads.id, input.threadId),
				eq(schema.threads.userId, userId),
			),
		})
		if (!thread) throw new Error('Thread not found')

		const templateIdCandidate =
			(input.templateId ? String(input.templateId) : null) ??
			(thread.templateId ? String(thread.templateId) : null) ??
			DEFAULT_THREAD_TEMPLATE_ID

		const effectiveTemplateId =
			templateIdCandidate in THREAD_TEMPLATES
				? templateIdCandidate
				: DEFAULT_THREAD_TEMPLATE_ID

		const effectiveTemplateConfig =
			input.templateConfig !== undefined
				? input.templateConfig
				: (thread.templateConfig ?? null)

		const renderId = createId()
		const jobId = `job_${createId()}`

		const audioAssetId = thread.audioAssetId
			? String(thread.audioAssetId)
			: null
		const audioAsset = audioAssetId
			? await db.query.threadAssets.findFirst({
					where: and(
						eq(schema.threadAssets.id, audioAssetId),
						eq(schema.threadAssets.userId, userId),
						eq(schema.threadAssets.kind, 'audio'),
					),
					columns: { storageKey: true },
				})
			: null

		// Materialize snapshot JSON into the bucket (renderer-remotion will fetch it via presigned URL).
		const snapshot = await buildThreadRenderSnapshot({
			threadId: thread.id,
			userId,
			jobId,
			templateId: effectiveTemplateId,
			templateConfig: effectiveTemplateConfig,
		})

		await db.insert(schema.threadRenders).values({
			id: renderId,
			threadId: thread.id,
			userId,
			status: 'queued',
			jobId,
			templateId: effectiveTemplateId,
			templateConfig: effectiveTemplateConfig as any,
			audioAssetId,
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
					templateId: effectiveTemplateId,
					templateConfig: effectiveTemplateConfig,
					composeMode: 'overlay-only',
				},
				options: {
					resourceType: 'thread',
					templateId: effectiveTemplateId,
					templateConfig:
						effectiveTemplateConfig === null
							? undefined
							: effectiveTemplateConfig,
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
							audioKey: audioAsset?.storageKey ?? null,
						},
						outputs: { videoKey: null },
						optionsSnapshot: {
							resourceType: 'thread',
							threadId: thread.id,
							templateId: effectiveTemplateId,
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
			where: and(
				eq(schema.threadRenders.id, input.renderId),
				eq(schema.threadRenders.userId, userId),
			),
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
			where: and(
				eq(schema.threadRenders.jobId, input.jobId),
				eq(schema.threadRenders.userId, userId),
			),
			columns: { id: true },
		})
		if (!render) throw new Error('Render job not found')

		return await getJobStatus(input.jobId)
	})

export const getCloudAssetIngestStatuses = os
	.input(
		z.object({
			jobIds: z.array(z.string().min(1)).min(1).max(25),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const jobIds = [
			...new Set(input.jobIds.map((x) => String(x).trim()).filter(Boolean)),
		].slice(0, 25)
		if (jobIds.length === 0) return { items: [] as any[], errors: [] as any[] }

		const tasks = await db
			.select({
				targetId: schema.tasks.targetId,
				jobId: schema.tasks.jobId,
			})
			.from(schema.tasks)
			.where(
				and(
					eq(schema.tasks.userId, userId),
					eq(schema.tasks.kind, TASK_KINDS.THREAD_ASSET_INGEST),
					inArray(schema.tasks.jobId, jobIds),
				),
			)

		const lookups = tasks
			.map((t) => ({
				targetId: String(t.targetId),
				jobId: t.jobId ? String(t.jobId) : '',
			}))
			.filter((t) => t.jobId)

		const settled = await Promise.allSettled(
			lookups.map(async (t) => {
				const status = await getJobStatus(t.jobId)
				return {
					targetId: t.targetId,
					jobId: t.jobId,
					status: status.status,
					phase: status.phase ?? null,
					progress:
						typeof status.progress === 'number' &&
						Number.isFinite(status.progress)
							? status.progress
							: null,
					message: status.message ?? null,
					purpose: status.purpose ?? null,
				}
			}),
		)

		const items: any[] = []
		const errors: Array<{ jobId: string; message: string }> = []
		for (let i = 0; i < settled.length; i++) {
			const r = settled[i]
			if (r.status === 'fulfilled') {
				items.push(r.value)
			} else {
				const jobId = lookups[i]?.jobId ?? ''
				errors.push({
					jobId,
					message:
						r.reason instanceof Error ? r.reason.message : String(r.reason),
				})
			}
		}

		return { items, errors }
	})
