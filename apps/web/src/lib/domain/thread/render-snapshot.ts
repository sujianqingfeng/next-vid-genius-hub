import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import { THREAD_TEMPLATE_COMPILE_VERSION } from '@app/remotion-project/thread-template-config'
import { getThreadTemplate } from '@app/remotion-project/thread-templates'
import { bucketPaths } from '@app/media-domain'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { putObjectByKey } from '~/lib/infra/cloudflare'
import { presignGetByKey } from '~/lib/infra/cloudflare/storage'
import { getDb, schema } from '~/lib/infra/db'
import { blocksToPlainText } from '~/lib/domain/thread/utils/plain-text'
import { collectThreadTemplateAssetIds } from '~/lib/domain/thread/template-assets'

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

export function sanitizeThreadTemplateConfigForRender(
	templateConfig: unknown | null | undefined,
): unknown | null | undefined {
	if (templateConfig == null) return templateConfig
	if (typeof templateConfig !== 'object') return templateConfig

	const stripNode = (node: any): any => {
		if (!node) return node
		if (Array.isArray(node)) {
			const next = node.map(stripNode).filter(Boolean)
			return next
		}
		if (typeof node !== 'object') return node

		if (node.type === 'Video' && String(node.assetId ?? '') === '__VIDEO_SLOT__') {
			return null
		}

		const out: any = Array.isArray(node) ? [] : { ...node }

		if (Array.isArray(node.children)) {
			out.children = node.children.map(stripNode).filter(Boolean)
			if (out.type === 'Absolute' && out.children.length === 0) return null
		}

		if (node.type === 'Repeat') {
			if (node.itemRoot != null) out.itemRoot = stripNode(node.itemRoot)
			if (out.itemRoot == null) delete out.itemRoot
		}

		if (node.type === 'Scenes' && node.scenes && typeof node.scenes === 'object') {
			const scenes: any = { ...node.scenes }
			for (const k of Object.keys(scenes)) {
				const s = scenes[k]
				if (!s || typeof s !== 'object') continue
				if (s.root != null) scenes[k] = { ...s, root: stripNode(s.root) }
			}
			out.scenes = scenes
		}

		return out
	}

	// Template config shape is { scenes: { cover/post: { root } }, ... }.
	const cfg: any = templateConfig
	if (cfg.scenes && typeof cfg.scenes === 'object') {
		const scenes: any = { ...cfg.scenes }
		for (const k of Object.keys(scenes)) {
			const s = scenes[k]
			if (!s || typeof s !== 'object') continue
			if (s.root != null) scenes[k] = { ...s, root: stripNode(s.root) }
		}
		return { ...cfg, scenes }
	}

	return stripNode(cfg)
}

export async function buildThreadRenderSnapshot(input: {
	threadId: string
	jobId: string
	userId: string
	templateId: string
	templateConfig?: unknown | null
	/**
	 * If provided, the snapshot will ensure the root post has a `video` content block
	 * using this asset id so the renderer can show it inline (content-block placement).
	 * This does not mutate the DB.
	 */
	mainVideoAssetId?: string | null
}): Promise<{ key: string; inputProps: ThreadVideoInputProps }> {
	const db = await getDb()
	const thread = await db.query.threads.findFirst({
		where: and(
			eq(schema.threads.id, input.threadId),
			eq(schema.threads.userId, input.userId),
		),
	})
	if (!thread) throw new Error('Thread not found')

	const templateConfig =
		input.templateConfig === undefined
			? undefined
			: sanitizeThreadTemplateConfigForRender(input.templateConfig)

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

	let rootBlocks = (root.contentBlocks ?? [
		{
			id: 'text-0',
			type: 'text',
			data: { text: firstTextBlock(root.contentBlocks) },
		},
	]) as any
	const mainVideoAssetId =
		typeof input.mainVideoAssetId === 'string' && input.mainVideoAssetId.trim()
			? input.mainVideoAssetId.trim()
			: null
	if (mainVideoAssetId) {
		const next = Array.isArray(rootBlocks) ? [...rootBlocks] : []
		let replaced = false
		for (const b of next) {
			if (!b || typeof b !== 'object') continue
			if ((b as any).type !== 'video') continue
			const data =
				(b as any).data && typeof (b as any).data === 'object'
					? { ...(b as any).data }
					: {}
			data.assetId = mainVideoAssetId
			;(b as any).data = data
			replaced = true
			break
		}
		if (!replaced) {
			next.unshift({
				id: `media-main-${mainVideoAssetId.slice(0, 8)}`,
				type: 'video',
				data: { assetId: mainVideoAssetId },
			})
		}
		rootBlocks = next
	}

	const rootPlain = root.plainText || blocksToPlainText(rootBlocks)

	const referencedAssetIds = new Set<string>()
	for (const id of collectThreadTemplateAssetIds(templateConfig)) {
		referencedAssetIds.add(id)
	}
	if (mainVideoAssetId) referencedAssetIds.add(mainVideoAssetId)

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

	const templateConfigJson =
		templateConfig === undefined ? null : stableStringify(templateConfig)
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
				templateConfig === undefined ? undefined : (templateConfig as any),
		}

	const key = bucketPaths.inputs.comments(thread.id, { title: thread.title })
	const compileVersion =
		getThreadTemplate(input.templateId)?.compileVersion ??
		THREAD_TEMPLATE_COMPILE_VERSION
	await putObjectByKey(
		key,
		'application/json',
			JSON.stringify({
				kind: 'thread-render-snapshot',
				threadId: thread.id,
				jobId: input.jobId,
				templateId: input.templateId,
				templateConfigHash,
				compileVersion,
				inputProps,
			}),
		)

	return { key, inputProps }
}
