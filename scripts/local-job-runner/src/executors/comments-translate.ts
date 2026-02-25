import path from 'node:path'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type CommentsTranslateInput = {
	dataPath?: string
	dataUrl?: string
	outputPath?: string
	outputDir?: string
	targetLanguage?: string
	force?: boolean
	translateTitle?: boolean
	translateComments?: boolean
	mode?: 'manual'
	manualTemplatePath?: string
}

const DEFAULT_TARGET_LANGUAGE = 'zh-CN'

function normalizeSnapshot(raw: unknown): {
	snapshot: Record<string, unknown>
	videoInfo: Record<string, unknown>
	comments: Array<Record<string, unknown>>
} {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error('comments-translate input must be a JSON object')
	}
	const snapshot = raw as Record<string, unknown>
	const videoInfoRaw =
		snapshot.videoInfo && typeof snapshot.videoInfo === 'object'
			? (snapshot.videoInfo as Record<string, unknown>)
			: {}
	const commentsRaw = Array.isArray(snapshot.comments) ? snapshot.comments : []
	const comments = commentsRaw
		.filter((item) => item && typeof item === 'object')
		.map((item, index) => {
			const c = item as Record<string, unknown>
			return {
				...c,
				id: String(c.id || `c_${index}`),
				author: String(c.author || 'unknown'),
				content: String(c.content || ''),
				likes: Number(c.likes || 0) || 0,
				replyCount: Number(c.replyCount || 0) || 0,
				translatedContent:
					typeof c.translatedContent === 'string'
						? c.translatedContent
						: undefined,
			}
		})
	return { snapshot, videoInfo: { ...videoInfoRaw }, comments }
}

function collectCommentIndices(
	comments: Array<Record<string, unknown>>,
	force: boolean,
	translateComments: boolean,
): number[] {
	const commentIndices: number[] = []
	if (!translateComments) return commentIndices
	for (let index = 0; index < comments.length; index++) {
		const comment = comments[index]!
		const text = String(comment.content || '').trim()
		if (!text) continue
		const hasTranslatedContent =
			typeof comment.translatedContent === 'string' &&
			String(comment.translatedContent).trim().length > 0
		if (!force && hasTranslatedContent) continue
		commentIndices.push(index)
	}
	return commentIndices
}

function shouldTranslateTitleNow(
	videoInfo: Record<string, unknown>,
	force: boolean,
	translateTitle: boolean,
): boolean {
	const title = String(videoInfo.title || '').trim()
	const hasTranslatedTitle = typeof videoInfo.translatedTitle === 'string' &&
		String(videoInfo.translatedTitle).trim().length > 0
	return translateTitle && title.length > 0 && (force || !hasTranslatedTitle)
}

function unsupportedModeReason(value: unknown): string | undefined {
	const mode = String(value || '')
		.trim()
		.toLowerCase()
	if (!mode || mode === 'manual') return undefined
	return `Requested mode "${mode}" is no longer supported; generated manual template`
}

export const commentsTranslateExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as CommentsTranslateInput
	if (!input?.dataPath && !input?.dataUrl) {
		throw new Error('comments-translate requires input.dataPath or input.dataUrl')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'comments-translate'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'comments-snapshot.translated.json')
	const manualTemplatePath = input.manualTemplatePath
		? resolveOutputPath(outputDir, input.manualTemplatePath)
		: path.join(outputDir, 'comments-translation.template.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.06,
		message: 'Loading comments snapshot',
	})

	const dataText = await readTextFromPathOrUrl({
		path: input.dataPath,
		url: input.dataUrl,
		timeoutMs: 45_000,
	})
	const raw = JSON.parse(dataText)
	const { snapshot, videoInfo, comments } = normalizeSnapshot(raw)

	const force = Boolean(input.force)
	const translateTitle = input.translateTitle !== false
	const translateComments = input.translateComments !== false
	const pendingTitle = shouldTranslateTitleNow(videoInfo, force, translateTitle)
	const pendingCommentIndices = collectCommentIndices(comments, force, translateComments)
	const title = String(videoInfo.title || '').trim()
	const translatedTitleValue = String(videoInfo.translatedTitle || '').trim()
	const reason = unsupportedModeReason(input.mode)

	const template = {
		version: 1,
		kind: 'comments-translation-template',
		generatedAt: new Date().toISOString(),
		targetLanguage: input.targetLanguage || DEFAULT_TARGET_LANGUAGE,
		mode: 'manual',
		reason: reason || undefined,
		title: pendingTitle
			? {
					source: title,
					translated:
						translatedTitleValue.length > 0 ? translatedTitleValue : '',
					status: 'pending',
				}
			: undefined,
		items: pendingCommentIndices.map((index) => {
			const comment = comments[index] || {}
			const translated = String(comment.translatedContent || '').trim()
			return {
				id: String(comment.id || `c_${index}`),
				author: String(comment.author || 'unknown'),
				content: String(comment.content || ''),
				translatedContent: translated.length > 0 ? translated : '',
				status: 'pending',
			}
		}),
	}

	await writeJsonFile(manualTemplatePath, template)
	const translatedSnapshot = {
		...snapshot,
		videoInfo,
		comments,
	}
	await writeJsonFile(outputPath, translatedSnapshot)

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments translation prepared for manual editing',
		outputs: {
			snapshot: {
				path: outputPath,
				contentType: 'application/json',
			},
			manualTemplate: {
				path: manualTemplatePath,
				contentType: 'application/json',
			},
		},
		metadata: {
			targetLanguage: input.targetLanguage || DEFAULT_TARGET_LANGUAGE,
			mode: 'manual',
			reason: reason || undefined,
			pendingTitle,
			pendingComments: pendingCommentIndices.length,
			totalComments: comments.length,
		},
	})
}
