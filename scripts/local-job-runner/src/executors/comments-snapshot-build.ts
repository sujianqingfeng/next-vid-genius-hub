import path from 'node:path'
import type { Comment, VideoInfo } from '@app/media-domain'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type CommentsSnapshotBuildInput = {
	dataPath?: string
	dataUrl?: string
	comments?: unknown[]
	videoInfo?: Record<string, unknown>
	title?: string
	translatedTitle?: string
	viewCount?: number
	author?: string
	thumbnail?: string
	series?: string
	seriesEpisode?: number
	outputPath?: string
	outputDir?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toStringOrUndefined(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const normalized = value.trim()
	return normalized.length > 0 ? normalized : undefined
}

function toNumberOrUndefined(value: unknown): number | undefined {
	const normalized = Number(value)
	return Number.isFinite(normalized) ? normalized : undefined
}

function normalizeComment(value: unknown, index: number): Comment | null {
	if (!isRecord(value)) return null
	const id = toStringOrUndefined(value.id) || `c_${index}`
	const author = toStringOrUndefined(value.author) || 'unknown'
	const content = typeof value.content === 'string' ? value.content : ''
	const translatedContent = toStringOrUndefined(value.translatedContent)
	const authorThumbnail = toStringOrUndefined(value.authorThumbnail)
	const likes = Number(value.likes || 0) || 0
	const replyCount = Number(value.replyCount || 0) || 0
	const source = toStringOrUndefined(value.source) as Comment['source'] | undefined
	const platform = toStringOrUndefined(value.platform)

	return {
		id,
		author,
		content,
		translatedContent,
		authorThumbnail,
		likes,
		replyCount,
		source,
		platform,
	}
}

function resolveVideoInfo(input: CommentsSnapshotBuildInput, base: unknown): VideoInfo {
	const source = isRecord(base) ? base : {}
	const override = isRecord(input.videoInfo) ? input.videoInfo : {}
	const merged = {
		...source,
		...override,
		title: input.title ?? override.title ?? source.title,
		translatedTitle:
			input.translatedTitle ?? override.translatedTitle ?? source.translatedTitle,
		viewCount: input.viewCount ?? override.viewCount ?? source.viewCount,
		author: input.author ?? override.author ?? source.author,
		thumbnail: input.thumbnail ?? override.thumbnail ?? source.thumbnail,
		series: input.series ?? override.series ?? source.series,
		seriesEpisode: input.seriesEpisode ?? override.seriesEpisode ?? source.seriesEpisode,
	}

	return {
		title: toStringOrUndefined(merged.title) || 'Untitled',
		translatedTitle: toStringOrUndefined(merged.translatedTitle),
		viewCount: Number(merged.viewCount || 0) || 0,
		author: toStringOrUndefined(merged.author),
		thumbnail: toStringOrUndefined(merged.thumbnail),
		series: toStringOrUndefined(merged.series),
		seriesEpisode: toNumberOrUndefined(merged.seriesEpisode),
	}
}

export const commentsSnapshotBuildExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as CommentsSnapshotBuildInput
	const hasInlineComments = Array.isArray(input.comments)
	if (!hasInlineComments && !input?.dataPath && !input?.dataUrl) {
		throw new Error(
			'comments-snapshot-build requires input.dataPath/input.dataUrl or input.comments',
		)
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'comments-snapshot-build'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'comments-snapshot.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.08,
		message: 'Loading comments payload',
	})

	let rawPayload: unknown = input.comments || []
	if (!hasInlineComments) {
		const dataText = await readTextFromPathOrUrl({
			path: input.dataPath,
			url: input.dataUrl,
			timeoutMs: 45_000,
		})
		rawPayload = JSON.parse(dataText)
	}

	const baseSnapshot = isRecord(rawPayload) ? rawPayload : {}
	const rawComments = Array.isArray(rawPayload)
		? rawPayload
		: Array.isArray(baseSnapshot.comments)
			? baseSnapshot.comments
			: []

	const comments: Comment[] = []
	for (let index = 0; index < rawComments.length; index++) {
		const normalized = normalizeComment(rawComments[index], index)
		if (normalized) comments.push(normalized)
	}

	if (comments.length === 0) {
		throw new Error('comments-snapshot-build received empty comments payload')
	}

	const videoInfo = resolveVideoInfo(input, baseSnapshot.videoInfo)
	const snapshot = {
		...baseSnapshot,
		videoInfo,
		comments,
	}

	await writeJsonFile(outputPath, snapshot)

	const outputs = {
		snapshot: {
			path: outputPath,
			contentType: 'application/json',
		},
	}

	const objectStore = ctx.ports.objectStore
	if (objectStore) {
		await ctx.emit({
			status: 'running',
			phase: 'uploading',
			progress: 0.95,
			message: 'Uploading snapshot to object store',
		})
		const key = await objectStore.putFile(
			`${ctx.jobId}/comments-snapshot-build/comments-snapshot.json`,
			outputPath,
			'application/json',
		)
		outputs.snapshot.key = key
		if (objectStore.getUrl) {
			const url = await objectStore.getUrl(key)
			if (url) outputs.snapshot.url = url
		}
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments snapshot build completed',
		outputs,
		metadata: {
			totalComments: comments.length,
			title: videoInfo.title,
			hasTranslatedTitle: Boolean(videoInfo.translatedTitle),
		},
	})
}
