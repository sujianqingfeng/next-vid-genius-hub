import path from 'node:path'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type ReviewDecision = 'keep' | 'remove' | 'pending'

type CommentsReviewInput = {
	dataPath?: string
	dataUrl?: string
	mode?: 'prepare' | 'apply'
	reviewPath?: string
	reviewUrl?: string
	outputPath?: string
	outputDir?: string
	strict?: boolean
	defaultDecision?: string
}

type SnapshotComment = {
	raw: Record<string, unknown>
	id: string
	author: string
	content: string
	translatedContent?: string
	likes: number
	replyCount: number
}

type ReviewItem = {
	id: string
	author: string
	content: string
	translatedContent?: string
	likes: number
	replyCount: number
	decision: ReviewDecision
	reason: string
	riskFlags: string[]
}

function normalizeDecision(value: unknown, fallback: ReviewDecision): ReviewDecision {
	const normalized = String(value || '')
		.trim()
		.toLowerCase()
	if (!normalized) return fallback
	if (
		normalized === 'keep' ||
		normalized === 'approve' ||
		normalized === 'approved' ||
		normalized === 'allow' ||
		normalized === 'pass' ||
		normalized === 'retain'
	) {
		return 'keep'
	}
	if (
		normalized === 'remove' ||
		normalized === 'reject' ||
		normalized === 'rejected' ||
		normalized === 'drop' ||
		normalized === 'block' ||
		normalized === 'ban'
	) {
		return 'remove'
	}
	if (
		normalized === 'pending' ||
		normalized === 'todo' ||
		normalized === 'review' ||
		normalized === 'skip'
	) {
		return 'pending'
	}
	return fallback
}

function detectRiskFlags(text: string): string[] {
	const source = String(text || '')
	const flags: string[] = []
	if (/https?:\/\//i.test(source)) flags.push('contains_url')
	if (/[@＠][a-zA-Z0-9_]/.test(source)) flags.push('contains_mention')
	if (/[#＃]/.test(source)) flags.push('contains_hashtag')
	return flags
}

function normalizeSnapshot(raw: unknown): {
	snapshot: Record<string, unknown>
	comments: SnapshotComment[]
} {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error('comments-review input must be a JSON object')
	}
	const snapshot = raw as Record<string, unknown>
	const commentsRaw = Array.isArray(snapshot.comments) ? snapshot.comments : []
	const comments = commentsRaw
		.filter((item) => item && typeof item === 'object')
		.map((item, index) => {
			const c = item as Record<string, unknown>
			const id = String(c.id || `c_${index}`)
			const author = String(c.author || 'unknown')
			const content = String(c.content || '')
			const translatedContent =
				typeof c.translatedContent === 'string'
					? c.translatedContent
					: undefined
			const likes = Number(c.likes || 0) || 0
			const replyCount = Number(c.replyCount || 0) || 0
			return {
				raw: {
					...c,
					id,
					author,
					content,
					likes,
					replyCount,
					translatedContent,
				},
				id,
				author,
				content,
				translatedContent,
				likes,
				replyCount,
			}
		})
	return { snapshot, comments }
}

function extractReviewItems(raw: unknown): Record<string, unknown>[] {
	if (Array.isArray(raw)) {
		return raw.filter((item) => item && typeof item === 'object') as Record<
			string,
			unknown
		>[]
	}
	if (!raw || typeof raw !== 'object') {
		throw new Error('Review payload must be a JSON array or object')
	}
	const reviewObj = raw as Record<string, unknown>
	const candidates = [reviewObj.items, reviewObj.decisions, reviewObj.comments]
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			return candidate.filter((item) => item && typeof item === 'object') as Record<
				string,
				unknown
			>[]
		}
	}
	throw new Error('Review payload must include items/decisions/comments array')
}

export const commentsReviewExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as CommentsReviewInput
	if (!input?.dataPath && !input?.dataUrl) {
		throw new Error('comments-review requires input.dataPath or input.dataUrl')
	}

	const mode = input.mode === 'apply' ? 'apply' : 'prepare'
	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'comments-review'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(
				outputDir,
				mode === 'apply'
					? 'comments-snapshot.reviewed.json'
					: 'comments-review.template.json',
			)

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
	const rawSnapshot = JSON.parse(dataText)
	const { snapshot, comments } = normalizeSnapshot(rawSnapshot)

	if (mode === 'prepare') {
		const defaultDecision = normalizeDecision(input.defaultDecision, 'pending')
		const items: ReviewItem[] = comments.map((comment) => {
			const mergedText = [
				String(comment.content || ''),
				String(comment.translatedContent || ''),
			]
				.filter(Boolean)
				.join('\n')
			return {
				id: comment.id,
				author: comment.author,
				content: comment.content,
				translatedContent: comment.translatedContent,
				likes: comment.likes,
				replyCount: comment.replyCount,
				decision: defaultDecision,
				reason: '',
				riskFlags: detectRiskFlags(mergedText),
			}
		})
		const reviewDoc = {
			version: 1,
			kind: 'comments-review-template',
			generatedAt: new Date().toISOString(),
			source: {
				dataPath: input.dataPath,
				dataUrl: input.dataUrl,
			},
			summary: {
				totalComments: items.length,
				defaultDecision,
			},
			items,
		}
		await writeJsonFile(outputPath, reviewDoc)

		await ctx.emit({
			status: 'completed',
			phase: 'completed',
			progress: 1,
			message: 'Comments review template prepared',
			outputs: {
				reviewTemplate: {
					path: outputPath,
					contentType: 'application/json',
				},
			},
			metadata: {
				mode,
				totalComments: items.length,
				defaultDecision,
			},
		})
		return
	}

	if (!input.reviewPath && !input.reviewUrl) {
		throw new Error('comments-review apply mode requires input.reviewPath or input.reviewUrl')
	}

	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.18,
		message: 'Loading review decisions',
	})

	const reviewText = await readTextFromPathOrUrl({
		path: input.reviewPath,
		url: input.reviewUrl,
		timeoutMs: 45_000,
	})
	const rawReview = JSON.parse(reviewText)
	const reviewItems = extractReviewItems(rawReview)

	const decisionMap = new Map<
		string,
		{
			decision: ReviewDecision
			reason: string
		}
	>()
	for (const item of reviewItems) {
		const id = String(item.id || '').trim()
		if (!id) continue
		decisionMap.set(id, {
			decision: normalizeDecision(item.decision, 'pending'),
			reason: String(item.reason || '').trim(),
		})
	}

	const strict = input.strict !== false
	const unresolvedFallback = normalizeDecision(input.defaultDecision, 'remove')
	let missingCount = 0
	let pendingCount = 0
	const unresolvedIds: string[] = []

	const staged = comments.map((comment) => {
		const review = decisionMap.get(comment.id)
		let decision = review?.decision || 'pending'
		const reason = review?.reason || ''

		if (!review) {
			missingCount += 1
		}
		if (decision === 'pending') {
			pendingCount += 1
		}
		if (!review || decision === 'pending') {
			if (strict) {
				unresolvedIds.push(comment.id)
			} else {
				decision = unresolvedFallback === 'pending' ? 'remove' : unresolvedFallback
			}
		}

		return {
			comment,
			decision,
			reason,
		}
	})

	if (strict && unresolvedIds.length > 0) {
		const sampleIds = unresolvedIds.slice(0, 12).join(', ')
		const more = unresolvedIds.length > 12 ? ` ... +${unresolvedIds.length - 12}` : ''
		throw new Error(
			`Review not finished. ${unresolvedIds.length} comments are missing decisions (examples: ${sampleIds}${more})`,
		)
	}

	const keptComments: Record<string, unknown>[] = []
	const removedComments: Array<{
		id: string
		author: string
		content: string
		translatedContent?: string
		reason: string
	}> = []

	for (const item of staged) {
		if (item.decision === 'keep') {
			keptComments.push(item.comment.raw)
			continue
		}
		removedComments.push({
			id: item.comment.id,
			author: item.comment.author,
			content: item.comment.content,
			translatedContent: item.comment.translatedContent,
			reason: item.reason || 'manual_review_removed',
		})
	}

	const existingReview =
		snapshot.review && typeof snapshot.review === 'object' && !Array.isArray(snapshot.review)
			? (snapshot.review as Record<string, unknown>)
			: {}
	const reviewedSnapshot = {
		...snapshot,
		comments: keptComments,
		review: {
			...existingReview,
			mode: 'manual-comments-review',
			reviewedAt: new Date().toISOString(),
			reviewPath: input.reviewPath,
			reviewUrl: input.reviewUrl,
			totalComments: comments.length,
			keptComments: keptComments.length,
			removedComments: removedComments.length,
			pendingComments: pendingCount,
			missingComments: missingCount,
			strict,
		},
	}

	const removedPath = path.join(outputDir, 'comments-removed.json')
	await writeJsonFile(outputPath, reviewedSnapshot)
	await writeJsonFile(removedPath, removedComments)

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments review applied',
		outputs: {
			snapshot: {
				path: outputPath,
				contentType: 'application/json',
			},
			removedComments: {
				path: removedPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			mode,
			totalComments: comments.length,
			keptComments: keptComments.length,
			removedComments: removedComments.length,
			pendingComments: pendingCount,
			missingComments: missingCount,
			strict,
		},
	})
}
