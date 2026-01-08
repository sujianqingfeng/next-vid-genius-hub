import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import {
	getDefaultAiModel,
	isEnabledModel,
} from '~/lib/features/ai/config/service'
import { buildRequestContext } from '~/lib/features/auth/context'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import { startCloudDownload } from '~/lib/domain/media/server/download'
import {
	chargeLlmUsage,
	InsufficientPointsError,
} from '~/lib/domain/points/billing'
import {
	calculateAsrCost,
	calculateDownloadCost,
} from '~/lib/domain/points/pricing'
import { subtitleService } from '~/lib/features/subtitle/server/subtitle'
import { TRANSLATION_PROMPT_IDS } from '~/lib/features/subtitle/config/prompts'
import { createId } from '~/lib/shared/utils/id'

type AgentActionKind = (typeof schema.agentActions.$inferSelect)['kind']
type AgentActionStatus = (typeof schema.agentActions.$inferSelect)['status']
type AgentActionRow = typeof schema.agentActions.$inferSelect

const ConfirmBodySchema = z.object({
	actionId: z.string().trim().min(1),
})

const CancelBodySchema = z.object({
	actionId: z.string().trim().min(1),
})

const SuggestNextBodySchema = z.object({
	mediaId: z.string().trim().min(1),
})

function appendResponseCookies(res: Response, cookies: string[]) {
	for (const cookie of cookies) {
		res.headers.append('Set-Cookie', cookie)
	}
}

function normalizeErrorMessage(err: unknown) {
	if (err instanceof Error) return err.message
	return String(err)
}

function errorMatches(error: unknown, needle: string) {
	const message = normalizeErrorMessage(error)
	if (message.includes(needle)) return true
	const cause =
		error instanceof Error ? (error as { cause?: unknown }).cause : undefined
	const causeMessage = normalizeErrorMessage(cause)
	return causeMessage.includes(needle)
}

async function ensureAgentDbReady(): Promise<Response | null> {
	try {
		await getDb()
		return null
	} catch (error) {
		if (errorMatches(error, 'D1_BINDING_MISSING')) {
			return Response.json(
				{
					error: 'database unavailable in this runtime',
					hint: 'Use `pnpm dev:web` (Wrangler runtime) for /api/agent/* endpoints.',
				},
				{ status: 503 },
			)
		}
		if (errorMatches(error, 'D1_SCHEMA_NOT_READY')) {
			return Response.json(
				{
					error: 'database schema not ready',
					hint: 'Run `pnpm db:d1:migrate:local` and restart the dev server.',
				},
				{ status: 503 },
			)
		}
		throw error
	}
}

async function requireAuthedUser(request: Request) {
	const context = await buildRequestContext(request)
	const user = context.auth.user
	return { context, user }
}

async function getActionForUser(input: {
	userId: string
	actionId: string
}): Promise<AgentActionRow | null> {
	const db = await getDb()
	return (
		(await db.query.agentActions.findFirst({
			where: and(
				eq(schema.agentActions.id, input.actionId),
				eq(schema.agentActions.userId, input.userId),
			),
		})) ?? null
	)
}

async function updateActionForUser(input: {
	userId: string
	actionId: string
	patch: Partial<typeof schema.agentActions.$inferInsert>
	whereStatus?: AgentActionStatus
}) {
	const db = await getDb()
	const where = input.whereStatus
		? and(
				eq(schema.agentActions.id, input.actionId),
				eq(schema.agentActions.userId, input.userId),
				eq(schema.agentActions.status, input.whereStatus),
			)
		: and(
				eq(schema.agentActions.id, input.actionId),
				eq(schema.agentActions.userId, input.userId),
			)
	return db.update(schema.agentActions).set(input.patch).where(where)
}

async function ensureMediaOwnedByUser(input: {
	userId: string
	mediaId: string
}) {
	const db = await getDb()
	const media = await db.query.media.findFirst({
		where: and(
			eq(schema.media.id, input.mediaId),
			eq(schema.media.userId, input.userId),
		),
	})
	if (!media) throw new Error('Media not found')
	return media
}

function shouldSuggestNext(media: typeof schema.media.$inferSelect) {
	if (media.downloadStatus !== 'completed') return null
	if (!media.transcription && !media.optimizedTranscription)
		return 'asr' as const
	if (!media.optimizedTranscription) return 'optimize' as const
	if (!media.translation) return 'translate' as const
	if (!media.renderSubtitlesJobId) return 'render' as const
	return null
}

async function createProposedAction(input: {
	userId: string
	kind: AgentActionKind
	params: Record<string, unknown>
	estimate?: Record<string, unknown>
}): Promise<AgentActionRow> {
	const db = await getDb()
	const id = createId()
	const now = new Date()

	await db.insert(schema.agentActions).values({
		id,
		userId: input.userId,
		kind: input.kind,
		status: 'proposed',
		params: input.params,
		estimate: input.estimate ?? null,
		result: null,
		error: null,
		createdAt: now,
	})

	const row = await getActionForUser({ userId: input.userId, actionId: id })
	if (!row) throw new Error('Failed to create agent action')
	return row
}

async function findPendingActionForMedia(input: {
	userId: string
	kind: AgentActionKind
	mediaId: string
}): Promise<AgentActionRow | null> {
	const db = await getDb()
	const rows = await db.query.agentActions.findMany({
		where: and(
			eq(schema.agentActions.userId, input.userId),
			eq(schema.agentActions.kind, input.kind),
			inArray(schema.agentActions.status, ['proposed', 'running'] as any),
		),
		orderBy: (t, { desc }) => [desc(t.createdAt)],
		limit: 50,
	})

	for (const row of rows) {
		const params = (row.params ?? {}) as any
		if (
			typeof params?.mediaId === 'string' &&
			params.mediaId === input.mediaId
		) {
			return row
		}
	}

	return null
}

export async function handleAgentActionCancelRequest(
	request: Request,
): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', {
			status: 405,
			headers: { Allow: 'POST' },
		})
	}

	const dbGate = await ensureAgentDbReady()
	if (dbGate) return dbGate

	const { context, user } = await requireAuthedUser(request)
	if (!user) {
		const res = Response.json({ error: 'unauthorized' }, { status: 401 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	let input: z.infer<typeof CancelBodySchema>
	try {
		input = CancelBodySchema.parse(await request.json())
	} catch (err) {
		const res = Response.json(
			{ error: err instanceof Error ? err.message : 'bad request' },
			{ status: 400 },
		)
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	await updateActionForUser({
		userId: user.id,
		actionId: input.actionId,
		whereStatus: 'proposed',
		patch: { status: 'canceled' },
	})

	const row = await getActionForUser({
		userId: user.id,
		actionId: input.actionId,
	})
	const res = Response.json({ action: row }, { status: 200 })
	appendResponseCookies(res, context.responseCookies)
	return res
}

export async function handleAgentActionSuggestNextRequest(
	request: Request,
): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', {
			status: 405,
			headers: { Allow: 'POST' },
		})
	}

	const dbGate = await ensureAgentDbReady()
	if (dbGate) return dbGate

	const { context, user } = await requireAuthedUser(request)
	if (!user) {
		const res = Response.json({ error: 'unauthorized' }, { status: 401 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	let input: z.infer<typeof SuggestNextBodySchema>
	try {
		input = SuggestNextBodySchema.parse(await request.json())
	} catch (err) {
		const res = Response.json(
			{ error: err instanceof Error ? err.message : 'bad request' },
			{ status: 400 },
		)
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const media = await ensureMediaOwnedByUser({
		userId: user.id,
		mediaId: input.mediaId,
	})
	const next = shouldSuggestNext(media)
	if (!next) {
		const res = Response.json({ action: null }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	if (next === 'asr') {
		const existing = await findPendingActionForMedia({
			userId: user.id,
			kind: 'asr',
			mediaId: media.id,
		})
		if (existing) {
			const res = Response.json({ action: existing }, { status: 200 })
			appendResponseCookies(res, context.responseCookies)
			return res
		}

		const defaultAsr = await getDefaultAiModel('asr')
		const modelId = defaultAsr?.id
		const estimate: Record<string, unknown> = {
			basis: 'duration',
			unknown: true,
		}
		if (modelId && typeof media.duration === 'number' && media.duration > 0) {
			try {
				const cost = await calculateAsrCost({
					modelId,
					durationSeconds: media.duration,
				})
				estimate.points = cost.points
				estimate.unknown = false
			} catch {
				// best-effort
			}
		}
		const action = await createProposedAction({
			userId: user.id,
			kind: 'asr',
			params: {
				mediaId: media.id,
				modelId: modelId ?? null,
			},
			estimate,
		})
		const res = Response.json({ action }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	if (next === 'optimize') {
		const existing = await findPendingActionForMedia({
			userId: user.id,
			kind: 'optimize',
			mediaId: media.id,
		})
		if (existing) {
			const res = Response.json({ action: existing }, { status: 200 })
			appendResponseCookies(res, context.responseCookies)
			return res
		}

		const defaultLlm = await getDefaultAiModel('llm')
		const action = await createProposedAction({
			userId: user.id,
			kind: 'optimize',
			params: {
				mediaId: media.id,
				modelId: defaultLlm?.id ?? null,
				// Keep defaults in subtitle ORPC schema.
				pauseThresholdMs: 480,
				maxSentenceMs: 8000,
				maxChars: 68,
				lightCleanup: false,
				textCorrect: false,
			},
			estimate: { basis: 'tokens', unknown: true },
		})
		const res = Response.json({ action }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	if (next === 'translate') {
		const existing = await findPendingActionForMedia({
			userId: user.id,
			kind: 'translate',
			mediaId: media.id,
		})
		if (existing) {
			const res = Response.json({ action: existing }, { status: 200 })
			appendResponseCookies(res, context.responseCookies)
			return res
		}

		const defaultLlm = await getDefaultAiModel('llm')
		const action = await createProposedAction({
			userId: user.id,
			kind: 'translate',
			params: {
				mediaId: media.id,
				modelId: defaultLlm?.id ?? null,
				target: 'zh-CN',
				format: 'vtt-bilingual',
			},
			estimate: { basis: 'tokens', unknown: true },
		})
		const res = Response.json({ action }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	// render
	const existing = await findPendingActionForMedia({
		userId: user.id,
		kind: 'render',
		mediaId: media.id,
	})
	if (existing) {
		const res = Response.json({ action: existing }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const action = await createProposedAction({
		userId: user.id,
		kind: 'render',
		params: {
			mediaId: media.id,
		},
		estimate: { basis: 'unknown', unknown: true },
	})
	const res = Response.json({ action }, { status: 200 })
	appendResponseCookies(res, context.responseCookies)
	return res
}

const DownloadParamsSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).optional().default('1080p'),
	proxyId: z.string().optional().nullable(),
})

const AsrParamsSchema = z.object({
	mediaId: z.string().min(1),
	modelId: z.string().min(1).nullable().optional(),
	language: z.string().min(2).max(16).optional(),
})

const OptimizeParamsSchema = z.object({
	mediaId: z.string().min(1),
	modelId: z.string().min(1).nullable().optional(),
	pauseThresholdMs: z.number().min(0).max(5000).default(480),
	maxSentenceMs: z.number().min(1000).max(30000).default(8000),
	maxChars: z.number().min(10).max(160).default(68),
	lightCleanup: z.boolean().default(false),
	textCorrect: z.boolean().default(false),
})

const TranslateParamsSchema = z.object({
	mediaId: z.string().min(1),
	modelId: z.string().min(1).nullable().optional(),
	promptId: z.enum(TRANSLATION_PROMPT_IDS).optional(),
	// Fixed by product decision:
	target: z.literal('zh-CN').optional(),
	format: z.literal('vtt-bilingual').optional(),
})

const RenderParamsSchema = z.object({
	mediaId: z.string().min(1),
})

async function tryTransitionToRunning(args: {
	userId: string
	actionId: string
}): Promise<boolean> {
	const res: any = await updateActionForUser({
		userId: args.userId,
		actionId: args.actionId,
		whereStatus: 'proposed',
		patch: { status: 'running', confirmedAt: new Date(), error: null },
	})

	const changes =
		typeof res?.meta?.changes === 'number'
			? res.meta.changes
			: typeof res?.changes === 'number'
				? res.changes
				: null
	return typeof changes === 'number' ? changes > 0 : true
}

export async function handleAgentActionConfirmRequest(
	request: Request,
): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', {
			status: 405,
			headers: { Allow: 'POST' },
		})
	}

	const dbGate = await ensureAgentDbReady()
	if (dbGate) return dbGate

	const { context, user } = await requireAuthedUser(request)
	if (!user) {
		const res = Response.json({ error: 'unauthorized' }, { status: 401 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	let input: z.infer<typeof ConfirmBodySchema>
	try {
		input = ConfirmBodySchema.parse(await request.json())
	} catch (err) {
		const res = Response.json(
			{ error: err instanceof Error ? err.message : 'bad request' },
			{ status: 400 },
		)
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const existing = await getActionForUser({
		userId: user.id,
		actionId: input.actionId,
	})
	if (!existing) {
		const res = Response.json({ error: 'not_found' }, { status: 404 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	if (existing.status !== 'proposed') {
		const res = Response.json({ action: existing }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const transitioned = await tryTransitionToRunning({
		userId: user.id,
		actionId: input.actionId,
	})

	if (!transitioned) {
		const row = await getActionForUser({
			userId: user.id,
			actionId: input.actionId,
		})
		const res = Response.json({ action: row }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const action = (await getActionForUser({
		userId: user.id,
		actionId: input.actionId,
	})) as AgentActionRow

	const params = (action.params ?? {}) as Record<string, unknown>

	try {
		let result: Record<string, unknown> = {}

		if (action.kind === 'download') {
			const parsed = DownloadParamsSchema.parse(params)

			let estimated: Record<string, unknown> = (action.estimate ?? {}) as any
			if (
				typeof estimated?.points !== 'number' &&
				typeof estimated?.durationSeconds === 'number'
			) {
				try {
					const cost = await calculateDownloadCost({
						durationSeconds: estimated.durationSeconds,
					})
					estimated = { ...estimated, points: cost.points }
				} catch {
					// best-effort
				}
			}

			result = await startCloudDownload({
				userId: user.id,
				url: parsed.url,
				quality: parsed.quality,
				proxyId: parsed.proxyId ?? null,
			})

			await updateActionForUser({
				userId: user.id,
				actionId: action.id,
				patch: { estimate: estimated },
			})
		} else if (action.kind === 'asr') {
			const parsed = AsrParamsSchema.parse(params)
			await ensureMediaOwnedByUser({ userId: user.id, mediaId: parsed.mediaId })

			const defaultAsr = parsed.modelId ? null : await getDefaultAiModel('asr')
			const modelId = parsed.modelId ?? defaultAsr?.id
			if (!modelId || !(await isEnabledModel('asr', modelId))) {
				throw new Error('ASR model is not enabled')
			}

			const res = await subtitleService.transcribe({
				mediaId: parsed.mediaId,
				model: modelId,
				language: parsed.language,
			})

			result = { mediaId: parsed.mediaId, jobId: res.jobId }
		} else if (action.kind === 'optimize') {
			const parsed = OptimizeParamsSchema.parse(params)
			await ensureMediaOwnedByUser({ userId: user.id, mediaId: parsed.mediaId })

			const defaultLlm = parsed.modelId ? null : await getDefaultAiModel('llm')
			const modelId = parsed.modelId ?? defaultLlm?.id
			if (!modelId || !(await isEnabledModel('llm', modelId))) {
				throw new Error('LLM model is not enabled')
			}

			const res = await subtitleService.optimizeTranscription({
				mediaId: parsed.mediaId,
				model: modelId,
				pauseThresholdMs: parsed.pauseThresholdMs,
				maxSentenceMs: parsed.maxSentenceMs,
				maxChars: parsed.maxChars,
				lightCleanup: parsed.lightCleanup,
				textCorrect: parsed.textCorrect,
			})

			try {
				await chargeLlmUsage({
					userId: user.id,
					modelId,
					inputTokens: res.usage?.inputTokens ?? 0,
					outputTokens: res.usage?.outputTokens ?? 0,
					refType: 'subtitle-optimize',
					refId: parsed.mediaId,
					remark: `subtitle optimize tokens=${res.usage?.totalTokens ?? 0}`,
				})
			} catch (err) {
				if (err instanceof InsufficientPointsError) {
					throw new Error('INSUFFICIENT_POINTS')
				}
				throw err
			}

			result = { mediaId: parsed.mediaId }
		} else if (action.kind === 'translate') {
			const parsed = TranslateParamsSchema.parse(params)
			await ensureMediaOwnedByUser({ userId: user.id, mediaId: parsed.mediaId })

			const defaultLlm = parsed.modelId ? null : await getDefaultAiModel('llm')
			const modelId = parsed.modelId ?? defaultLlm?.id
			if (!modelId || !(await isEnabledModel('llm', modelId))) {
				throw new Error('LLM model is not enabled')
			}

			const res = await subtitleService.translate({
				mediaId: parsed.mediaId,
				model: modelId,
				promptId: parsed.promptId,
			})

			try {
				await chargeLlmUsage({
					userId: user.id,
					modelId,
					inputTokens: res.usage?.inputTokens ?? 0,
					outputTokens: res.usage?.outputTokens ?? 0,
					refType: 'subtitle-translate',
					refId: parsed.mediaId,
					remark: `subtitle translate tokens=${res.usage?.totalTokens ?? 0}`,
				})
			} catch (err) {
				if (err instanceof InsufficientPointsError) {
					throw new Error('INSUFFICIENT_POINTS')
				}
				throw err
			}

			result = { mediaId: parsed.mediaId }
		} else if (action.kind === 'render') {
			const parsed = RenderParamsSchema.parse(params)
			await ensureMediaOwnedByUser({ userId: user.id, mediaId: parsed.mediaId })
			const res = await subtitleService.startCloudRender({
				mediaId: parsed.mediaId,
				subtitleConfig: undefined,
			})
			result = { mediaId: parsed.mediaId, jobId: res.jobId }
		} else {
			throw new Error(`Unknown action kind: ${action.kind}`)
		}

		await updateActionForUser({
			userId: user.id,
			actionId: action.id,
			patch: {
				status: 'completed',
				completedAt: new Date(),
				result,
				error: null,
			},
		})
		const done = await getActionForUser({
			userId: user.id,
			actionId: action.id,
		})
		const res = Response.json({ action: done }, { status: 200 })
		appendResponseCookies(res, context.responseCookies)
		return res
	} catch (err) {
		const message = normalizeErrorMessage(err)
		const statusCode = message === 'INSUFFICIENT_POINTS' ? 402 : 500
		logger.warn(
			'api',
			`[agent.action.confirm] failed action=${action.id} kind=${action.kind} user=${user.id} error=${message}`,
		)
		await updateActionForUser({
			userId: user.id,
			actionId: action.id,
			patch: {
				status: 'failed',
				completedAt: new Date(),
				error: message,
			},
		})
		const row = await getActionForUser({ userId: user.id, actionId: action.id })
		const res = Response.json(
			{ error: message, action: row },
			{ status: statusCode },
		)
		appendResponseCookies(res, context.responseCookies)
		return res
	}
}

export async function proposeDownloadAction(input: {
	userId: string
	url: string
	quality?: '1080p' | '720p'
	proxyId?: string | null
}): Promise<AgentActionRow> {
	return createProposedAction({
		userId: input.userId,
		kind: 'download',
		params: {
			url: input.url,
			quality: input.quality ?? '1080p',
			proxyId: input.proxyId ?? null,
		},
		estimate: { basis: 'duration', unknown: true },
	})
}

export async function proposeAsrAction(input: {
	userId: string
	mediaId: string
	modelId?: string | null
	language?: string
}): Promise<AgentActionRow> {
	return createProposedAction({
		userId: input.userId,
		kind: 'asr',
		params: {
			mediaId: input.mediaId,
			modelId: input.modelId ?? null,
			language: input.language,
		},
		estimate: { basis: 'duration', unknown: true },
	})
}

export async function proposeOptimizeAction(input: {
	userId: string
	mediaId: string
	modelId?: string | null
}): Promise<AgentActionRow> {
	return createProposedAction({
		userId: input.userId,
		kind: 'optimize',
		params: {
			mediaId: input.mediaId,
			modelId: input.modelId ?? null,
			pauseThresholdMs: 480,
			maxSentenceMs: 8000,
			maxChars: 68,
			lightCleanup: false,
			textCorrect: false,
		},
		estimate: { basis: 'tokens', unknown: true },
	})
}

export async function proposeTranslateAction(input: {
	userId: string
	mediaId: string
	modelId?: string | null
}): Promise<AgentActionRow> {
	return createProposedAction({
		userId: input.userId,
		kind: 'translate',
		params: {
			mediaId: input.mediaId,
			modelId: input.modelId ?? null,
			target: 'zh-CN',
			format: 'vtt-bilingual',
		},
		estimate: { basis: 'tokens', unknown: true },
	})
}

export async function proposeRenderAction(input: {
	userId: string
	mediaId: string
}): Promise<AgentActionRow> {
	return createProposedAction({
		userId: input.userId,
		kind: 'render',
		params: { mediaId: input.mediaId },
		estimate: { basis: 'unknown', unknown: true },
	})
}
