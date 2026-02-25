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
	mode?: 'manual' | 'apply' | 'auto'
	manualTemplatePath?: string
	templatePath?: string
	templateUrl?: string
	strict?: boolean
	apiUrl?: string
	apiKey?: string
	model?: string
	concurrency?: number
	provider?: 'openai-compatible' | 'custom'
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

type TranslateCallInput = {
	text: string
	targetLanguage: string
	apiUrl?: string
	apiKey?: string
	model?: string
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

function normalizeMode(value: unknown): {
	mode: 'manual' | 'apply' | 'auto'
	reason?: string
} {
	const raw = String(value || '')
		.trim()
		.toLowerCase()
	if (!raw || raw === 'manual') {
		return {
			mode: 'manual',
		}
	}
	if (raw === 'apply') {
		return {
			mode: 'apply',
		}
	}
	if (raw === 'auto') {
		return {
			mode: 'auto',
		}
	}
	return {
		mode: 'manual',
		reason: `Requested mode "${raw}" is not supported; fallback to manual`,
	}
}

async function mapWithConcurrency<T>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
	if (items.length === 0) return
	const limit = Math.max(1, Math.floor(concurrency))
	let cursor = 0

	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const index = cursor++
			if (index >= items.length) return
			await worker(items[index]!, index)
		}
	})

	await Promise.all(runners)
}

async function callOpenAiCompatibleTranslate(
	input: TranslateCallInput,
): Promise<string> {
	const apiUrl =
		input.apiUrl ||
		process.env.COMMENTS_TRANSLATE_API_URL ||
		'https://api.openai.com/v1/chat/completions'
	const apiKey =
		input.apiKey ||
		process.env.COMMENTS_TRANSLATE_API_KEY ||
		process.env.OPENAI_API_KEY
	const model = input.model || process.env.COMMENTS_TRANSLATE_MODEL || 'gpt-4.1-mini'

	if (!apiKey) {
		throw new Error(
			'Translation API key is required (input.apiKey or COMMENTS_TRANSLATE_API_KEY/OPENAI_API_KEY)',
		)
	}

	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			temperature: 0,
			messages: [
				{
					role: 'system',
					content:
						'You are a translation engine. Return only translated text with no explanation.',
				},
				{
					role: 'user',
					content: `Translate the following text to ${input.targetLanguage}:\n\n${input.text}`,
				},
			],
		}),
	})

	if (!response.ok) {
		const body = await response.text().catch(() => '')
		throw new Error(`Translation request failed: ${response.status} ${body}`)
	}

	const json = (await response.json()) as Record<string, unknown>
	const choices = Array.isArray(json.choices) ? json.choices : []
	const first = (choices[0] || {}) as Record<string, unknown>
	const message = (first.message || {}) as Record<string, unknown>
	const content = String(message.content || '').trim()
	if (!content) {
		throw new Error('Translation response missing text content')
	}
	return content
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
	const { mode, reason } = normalizeMode(input.mode)

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

	if (mode === 'manual') {
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
		return
	}

	if (mode === 'auto') {
		const strict = input.strict !== false
		const targetLanguage = input.targetLanguage || DEFAULT_TARGET_LANGUAGE
		const translateText = async (text: string): Promise<string> => {
			if (ctx.ports.translate) {
				return ctx.ports.translate.translateText(text, input.model)
			}
			if (input.provider && input.provider !== 'openai-compatible') {
				throw new Error(
					'comments-translate auto currently supports provider=openai-compatible',
				)
			}
			return callOpenAiCompatibleTranslate({
				text,
				targetLanguage,
				apiUrl: input.apiUrl,
				apiKey: input.apiKey,
				model: input.model,
			})
		}

		let completedSteps = 0
		const totalSteps =
			pendingCommentIndices.length + (pendingTitle ? 1 : 0) || 1
		const toProgress = (done: number): number =>
			Math.max(0, Math.min(1, 0.2 + (done / totalSteps) * 0.75))

		let appliedTitle = false
		let unresolvedTitle = false
		let autoTitleText = ''
		let titleError = ''
		if (pendingTitle) {
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: toProgress(completedSteps),
				message: 'Auto translating title',
			})
			try {
				autoTitleText = await translateText(title)
				const normalized = String(autoTitleText || '').trim()
				if (normalized) {
					videoInfo.translatedTitle = normalized
					appliedTitle = true
				} else if (strict) {
					unresolvedTitle = true
				}
			} catch (error) {
				titleError = error instanceof Error ? error.message : String(error)
				if (strict) unresolvedTitle = true
			}
			completedSteps += 1
		}

		const unresolvedCommentIds: string[] = []
		const failedCommentIds: string[] = []
		const failedSamples: string[] = []
		const translatedById = new Map<string, string>()
		const concurrency = Math.max(1, Math.min(8, Number(input.concurrency || 3)))
		await mapWithConcurrency(pendingCommentIndices, concurrency, async (snapshotIndex) => {
			const comment = comments[snapshotIndex] || {}
			const commentId = String(comment.id || `c_${snapshotIndex}`)
			const text = String(comment.content || '').trim()
			if (!text) {
				completedSteps += 1
				return
			}
			try {
				const translated = String(await translateText(text)).trim()
				if (translated) {
					comment.translatedContent = translated
					translatedById.set(commentId, translated)
				} else {
					failedCommentIds.push(commentId)
					if (failedSamples.length < 5) {
						failedSamples.push(`${commentId}: empty translation result`)
					}
					if (strict) unresolvedCommentIds.push(commentId)
				}
			} catch (error) {
				failedCommentIds.push(commentId)
				if (failedSamples.length < 5) {
					failedSamples.push(
						`${commentId}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
				if (strict) unresolvedCommentIds.push(commentId)
			}
			completedSteps += 1
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: toProgress(completedSteps),
				message: `Auto translating comments (${completedSteps}/${totalSteps})`,
			})
		})

		if (pendingCommentIndices.length > 0 && translatedById.size === 0) {
			const template = {
				version: 1,
				kind: 'comments-translation-template',
				generatedAt: new Date().toISOString(),
				targetLanguage,
				mode: 'manual',
				reason:
					'Auto translation unavailable; fallback to manual translation template',
				title: pendingTitle
					? {
							source: title,
							translated: '',
							status: 'pending',
						}
					: undefined,
				items: pendingCommentIndices.map((index) => {
					const comment = comments[index] || {}
					return {
						id: String(comment.id || `c_${index}`),
						author: String(comment.author || 'unknown'),
						content: String(comment.content || ''),
						translatedContent: '',
						status: 'pending',
					}
				}),
			}

			const translatedSnapshot = {
				...snapshot,
				videoInfo,
				comments,
			}
			await writeJsonFile(manualTemplatePath, template)
			await writeJsonFile(outputPath, translatedSnapshot)

			await ctx.emit({
				status: 'completed',
				phase: 'completed',
				progress: 1,
				message:
					'Auto translation unavailable, switched to manual translation template',
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
					targetLanguage,
					mode: 'auto',
					fallbackMode: 'manual',
					pendingTitle,
					pendingComments: pendingCommentIndices.length,
					failedComments: failedCommentIds.length,
					titleError: titleError || undefined,
					failedSamples,
				},
			})
			return
		}

		if (strict && (unresolvedTitle || unresolvedCommentIds.length > 0)) {
			const sample = unresolvedCommentIds.slice(0, 12).join(', ')
			const more =
				unresolvedCommentIds.length > 12
					? ` ... +${unresolvedCommentIds.length - 12}`
					: ''
			const titleHint = unresolvedTitle ? 'title auto translation failed' : ''
			const commentHint =
				unresolvedCommentIds.length > 0
					? `comment auto translation failed: ${sample}${more}`
					: ''
			const separator = titleHint && commentHint ? '; ' : ''
			throw new Error(
				`comments-translate auto strict mode failed: ${titleHint}${separator}${commentHint}`,
			)
		}

		const template = {
			version: 1,
			kind: 'comments-translation-template',
			generatedAt: new Date().toISOString(),
			targetLanguage,
			mode: 'auto',
			title: pendingTitle
				? {
						source: title,
						translated: String(autoTitleText || '').trim(),
						status: appliedTitle ? 'done' : 'failed',
					}
				: undefined,
			items: pendingCommentIndices.map((index) => {
				const comment = comments[index] || {}
				const id = String(comment.id || `c_${index}`)
				const translated = String(translatedById.get(id) || '').trim()
				return {
					id,
					author: String(comment.author || 'unknown'),
					content: String(comment.content || ''),
					translatedContent: translated,
					status: translated ? 'done' : 'failed',
				}
			}),
		}

		const translatedSnapshot = {
			...snapshot,
			videoInfo,
			comments,
		}
		await writeJsonFile(manualTemplatePath, template)
		await writeJsonFile(outputPath, translatedSnapshot)

		await ctx.emit({
			status: 'completed',
			phase: 'completed',
			progress: 1,
			message: 'Comments auto translation completed',
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
				targetLanguage,
				mode: 'auto',
				strict,
				pendingTitle,
				pendingComments: pendingCommentIndices.length,
				appliedTitle,
				appliedComments: translatedById.size,
				unresolvedTitle,
				unresolvedComments: unresolvedCommentIds.length,
				failedComments: failedCommentIds.length,
				titleError: titleError || undefined,
				failedSamples,
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
			'comments-translate apply mode requires input.templatePath/input.templateUrl',
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
			mode: 'apply',
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
