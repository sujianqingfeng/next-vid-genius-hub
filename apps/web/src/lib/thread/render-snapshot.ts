import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import {
	THREAD_TEMPLATE_COMPILE_VERSION,
	normalizeThreadTemplateConfig,
} from '@app/remotion-project/thread-template-config'
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableJsonValue(value: unknown, depth = 0): unknown {
	if (depth > 50) return null
	if (Array.isArray(value))
		return value.map((v) => stableJsonValue(v, depth + 1))
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {}
		for (const key of Object.keys(value).sort()) {
			out[key] = stableJsonValue(value[key], depth + 1)
		}
		return out
	}
	return value
}

function stableStringify(value: unknown): string | null {
	try {
		return JSON.stringify(stableJsonValue(value))
	} catch {
		return null
	}
}

async function sha256Hex(input: string): Promise<string | null> {
	try {
		const subtle = (globalThis as any)?.crypto?.subtle
		if (!subtle) return null
		const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input))
		return [...new Uint8Array(buf)]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	} catch {
		return null
	}
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

	let audio: ThreadVideoInputProps['audio'] | undefined = undefined
	if (thread.audioAssetId) {
		const audioAsset = await db.query.threadAssets.findFirst({
			where: and(
				eq(schema.threadAssets.userId, input.userId),
				eq(schema.threadAssets.id, String(thread.audioAssetId)),
				eq(schema.threadAssets.kind, 'audio'),
			),
		})

		if (
			audioAsset &&
			audioAsset.status === 'ready' &&
			audioAsset.storageKey &&
			audioAsset.durationMs
		) {
			try {
				const url = await presignGetByKey(String(audioAsset.storageKey))
				audio = { url, durationMs: Number(audioAsset.durationMs) }
			} catch {}
		}
	}

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
		{
			id: 'text-0',
			type: 'text',
			data: { text: firstTextBlock(root.contentBlocks) },
		},
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
			if (!a.storageKey) continue
			let url: string | null = null
			try {
				url = await presignGetByKey(String(a.storageKey))
			} catch {}
			if (!url) continue
			assetsMap[String(a.id)] = {
				id: String(a.id),
				kind: a.kind,
				url,
			}
		}
	}

	const templateConfigResolved =
		input.templateConfig === undefined
			? undefined
			: normalizeThreadTemplateConfig(input.templateConfig)
	const templateConfigJson =
		templateConfigResolved === undefined
			? null
			: stableStringify(templateConfigResolved)
	const templateConfigHash = templateConfigJson
		? await sha256Hex(templateConfigJson)
		: null

	const inputProps: ThreadVideoInputProps = {
		thread: {
			title: thread.title,
			source: thread.source,
			sourceUrl: thread.sourceUrl ?? null,
		},
		audio,
		root: {
			id: root.id,
			author: {
				name: root.authorName,
				handle: root.authorHandle ?? null,
				avatarAssetId: root.authorAvatarAssetId ?? null,
			},
			contentBlocks: rootBlocks,
			plainText: rootPlain,
			translations: (root as any).translations ?? null,
			createdAt: toIso(root.createdAt),
			metrics: { likes: Number((root.metrics as any)?.likes ?? 0) || 0 },
		},
		replies: replies.map((r) => ({
			id: r.id,
			author: {
				name: r.authorName,
				handle: r.authorHandle ?? null,
				avatarAssetId: r.authorAvatarAssetId ?? null,
			},
			contentBlocks: (r.contentBlocks ?? []) as any,
			plainText:
				r.plainText || blocksToPlainText((r.contentBlocks ?? []) as any),
			translations: (r as any).translations ?? null,
			createdAt: toIso(r.createdAt),
			metrics: { likes: Number((r.metrics as any)?.likes ?? 0) || 0 },
		})),
		assets: Object.keys(assetsMap).length > 0 ? assetsMap : undefined,
		coverDurationInFrames: timeline.coverDurationInFrames,
		replyDurationsInFrames: timeline.commentDurationsInFrames,
		fps: REMOTION_FPS,
		templateConfig:
			templateConfigResolved === undefined
				? undefined
				: (templateConfigResolved as any),
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
			templateConfigResolved: templateConfigResolved ?? null,
			templateConfigHash,
			compileVersion: THREAD_TEMPLATE_COMPILE_VERSION,
			inputProps,
		}),
	)

	return { key, inputProps }
}
