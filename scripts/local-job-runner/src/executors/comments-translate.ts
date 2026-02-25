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
	manualTemplatePath?: string
	templatePath?: string
	templateUrl?: string
	strict?: boolean
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

type TemplateItem = {
	id: string
	translatedContent: string
	status: string
}

function normalizeTemplateItems(raw: unknown): Map<string, TemplateItem> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error('comments-translate apply mode requires a JSON template object')
	}
	const template = raw as Record<string, unknown>
	const itemsRaw = Array.isArray(template.items) ? template.items : []
	const map = new Map<string, TemplateItem>()
	for (const item of itemsRaw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue
		const row = item as Record<string, unknown>
		const id = String(row.id || '').trim()
		if (!id) continue
		map.set(id, {
			id,
			translatedContent: String(row.translatedContent || ''),
			status: String(row.status || ''),
		})
	}
	return map
}

function normalizeTemplateTranslatedTitle(raw: unknown): string | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
	const template = raw as Record<string, unknown>
	if (!template.title || typeof template.title !== 'object') return undefined
	const title = template.title as Record<string, unknown>
	const translated = String(title.translated || '').trim()
	return translated.length > 0 ? translated : undefined
}

type CommentsTranslateOperation = 'manual' | 'apply'

function resolveOperation(input: CommentsTranslateInput): CommentsTranslateOperation {
	const legacyModeRaw = (input as Record<string, unknown>).mode
	if (typeof legacyModeRaw !== 'undefined') {
		throw new Error(
			'comments-translate input.mode is no longer supported; omit mode and use templatePath/templateUrl to trigger apply',
		)
	}

	if (input.templatePath || input.templateUrl) {
		return 'apply'
	}

	return 'manual'
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
	const operation = resolveOperation(input)

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

	if (operation === 'manual') {
		const template = {
			version: 1,
			kind: 'comments-translation-template',
			generatedAt: new Date().toISOString(),
			targetLanguage: input.targetLanguage || DEFAULT_TARGET_LANGUAGE,
			mode: 'manual',
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
				operation: 'manual',
				pendingTitle,
				pendingComments: pendingCommentIndices.length,
				totalComments: comments.length,
			},
		})
		return
	}

	const strict = input.strict !== false
	const templatePathFromInput = input.templatePath
		? resolveOutputPath(process.cwd(), input.templatePath)
		: input.manualTemplatePath
			? resolveOutputPath(process.cwd(), input.manualTemplatePath)
			: undefined
	if (!templatePathFromInput && !input.templateUrl) {
		throw new Error(
			'comments-translate apply requires input.templatePath/input.templateUrl',
		)
	}

	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.2,
		message: 'Loading translation template',
	})

	const templateText = await readTextFromPathOrUrl({
		path: templatePathFromInput,
		url: input.templateUrl,
		timeoutMs: 45_000,
	})
	const rawTemplate = JSON.parse(templateText)
	const templateMap = normalizeTemplateItems(rawTemplate)
	const templateTranslatedTitle = normalizeTemplateTranslatedTitle(rawTemplate)

	let appliedComments = 0
	const unresolvedCommentIds: string[] = []
	for (const index of pendingCommentIndices) {
		const comment = comments[index] || {}
		const commentId = String(comment.id || `c_${index}`)
		const templateRow = templateMap.get(commentId)
		const translated = String(templateRow?.translatedContent || '').trim()
		if (!translated) {
			if (strict) unresolvedCommentIds.push(commentId)
			continue
		}
		comment.translatedContent = translated
		appliedComments += 1
	}

	let appliedTitle = false
	let unresolvedTitle = false
	if (pendingTitle) {
		if (templateTranslatedTitle) {
			videoInfo.translatedTitle = templateTranslatedTitle
			appliedTitle = true
		} else if (strict) {
			unresolvedTitle = true
		}
	}

	if (strict && (unresolvedTitle || unresolvedCommentIds.length > 0)) {
		const sample = unresolvedCommentIds.slice(0, 12).join(', ')
		const more =
			unresolvedCommentIds.length > 12
				? ` ... +${unresolvedCommentIds.length - 12}`
				: ''
		const titleHint = unresolvedTitle ? 'title is missing translation' : ''
		const commentHint =
			unresolvedCommentIds.length > 0
				? `missing comment translations: ${sample}${more}`
				: ''
		const separator = titleHint && commentHint ? '; ' : ''
		throw new Error(
			`comments-translate apply strict mode failed: ${titleHint}${separator}${commentHint}`,
		)
	}

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
		message: 'Comments translation applied to snapshot',
		outputs: {
			snapshot: {
				path: outputPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			targetLanguage: input.targetLanguage || DEFAULT_TARGET_LANGUAGE,
			operation: 'apply',
			strict,
			pendingTitle,
			pendingComments: pendingCommentIndices.length,
			appliedTitle,
			appliedComments,
			unresolvedTitle,
			unresolvedComments: unresolvedCommentIds.length,
		},
	})
}
