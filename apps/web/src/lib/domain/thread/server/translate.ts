import { and, asc, eq } from 'drizzle-orm'
import { getDefaultAiModel } from '~/lib/features/ai/config/service'
import { translateTextWithUsage } from '~/lib/features/ai/translate'
import { getDb, schema } from '~/lib/infra/db'
import { blocksToPlainText } from '~/lib/domain/thread/utils/plain-text'

export type ThreadPostTranslationLocale = 'zh-CN'

export type ThreadPostTranslationRecord = {
	locale: ThreadPostTranslationLocale
	plainText: string
	modelId: string
	createdAt: string
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export type ThreadPostTranslations = Partial<
	Record<ThreadPostTranslationLocale, ThreadPostTranslationRecord>
>

export async function translateThreadPost(input: {
	userId: string
	threadId: string
	postId: string
	targetLocale?: ThreadPostTranslationLocale
}): Promise<{ ok: true; translation: ThreadPostTranslationRecord | null }> {
	const targetLocale: ThreadPostTranslationLocale =
		input.targetLocale ?? 'zh-CN'

	const db = await getDb()
	const thread = await db.query.threads.findFirst({
		where: and(
			eq(schema.threads.id, input.threadId),
			eq(schema.threads.userId, input.userId),
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

	const sourceText =
		(post.plainText?.trim() ||
			blocksToPlainText((post.contentBlocks ?? []) as any).trim()) ??
		''
	if (!sourceText) return { ok: true, translation: null }

	const model = await getDefaultAiModel('llm')
	const { translation, usage } = await translateTextWithUsage(
		sourceText,
		model.id,
	)

	const record: ThreadPostTranslationRecord = {
		locale: targetLocale,
		plainText: translation,
		modelId: model.id,
		createdAt: new Date().toISOString(),
		usage,
	}

	const existing = (post.translations ?? undefined) as
		| ThreadPostTranslations
		| undefined
	const next: ThreadPostTranslations = { ...existing, [targetLocale]: record }

	await db
		.update(schema.threadPosts)
		.set({ translations: next as any, updatedAt: new Date() })
		.where(eq(schema.threadPosts.id, post.id))

	return { ok: true, translation: record }
}

export async function translateAllThreadPosts(input: {
	userId: string
	threadId: string
	targetLocale?: ThreadPostTranslationLocale
	maxPosts?: number
}): Promise<{
	ok: true
	processed: number
	translated: number
	skipped: number
	failed: number
	limitHit: boolean
}> {
	const targetLocale: ThreadPostTranslationLocale =
		input.targetLocale ?? 'zh-CN'
	const maxPosts = Math.max(1, Math.min(100, input.maxPosts ?? 30))

	const db = await getDb()
	const thread = await db.query.threads.findFirst({
		where: and(
			eq(schema.threads.id, input.threadId),
			eq(schema.threads.userId, input.userId),
		),
		columns: { id: true },
	})
	if (!thread) throw new Error('Thread not found')

	const posts = await db
		.select()
		.from(schema.threadPosts)
		.where(eq(schema.threadPosts.threadId, thread.id))
		.orderBy(asc(schema.threadPosts.depth), asc(schema.threadPosts.createdAt))

	if (posts.length === 0) {
		return {
			ok: true,
			processed: 0,
			translated: 0,
			skipped: 0,
			failed: 0,
			limitHit: false,
		}
	}

	const model = await getDefaultAiModel('llm')

	let processed = 0
	let translated = 0
	let skipped = 0
	let failed = 0

	for (const post of posts) {
		if (processed >= maxPosts) break
		processed++

		const existing = (post.translations ?? undefined) as
			| ThreadPostTranslations
			| undefined
		const existingText = (existing as any)?.[targetLocale]?.plainText
		if (typeof existingText === 'string' && existingText.trim()) {
			skipped++
			continue
		}

		const sourceText =
			(post.plainText?.trim() ||
				blocksToPlainText((post.contentBlocks ?? []) as any).trim()) ??
			''
		if (!sourceText) {
			skipped++
			continue
		}

		try {
			const { translation, usage } = await translateTextWithUsage(
				sourceText,
				model.id,
			)
			if (!translation?.trim()) {
				failed++
				continue
			}

			const record: ThreadPostTranslationRecord = {
				locale: targetLocale,
				plainText: translation,
				modelId: model.id,
				createdAt: new Date().toISOString(),
				usage,
			}

			const next: ThreadPostTranslations = {
				...existing,
				[targetLocale]: record,
			}

			await db
				.update(schema.threadPosts)
				.set({ translations: next as any, updatedAt: new Date() })
				.where(eq(schema.threadPosts.id, post.id))

			translated++
		} catch {
			failed++
		}
	}

	return {
		ok: true,
		processed,
		translated,
		skipped,
		failed,
		limitHit: posts.length > processed,
	}
}
