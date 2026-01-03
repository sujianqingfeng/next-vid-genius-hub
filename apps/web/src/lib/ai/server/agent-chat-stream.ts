import { stepCountIs, ToolLoopAgent, createAgentUIStreamResponse } from 'ai'
import { z } from 'zod'

import { buildRequestContext } from '~/lib/auth/context'
import type { AIProviderKind } from '~/lib/ai/config/service'
import {
	getAiModelConfig,
	getDefaultAiModel,
	isEnabledModel,
} from '~/lib/ai/config/service'
import {
	proposeAsrAction,
	proposeDownloadAction,
	proposeOptimizeAction,
	proposeRenderAction,
	proposeTranslateAction,
} from '~/lib/ai/server/agent-actions'
import { getProviderClient } from '~/lib/ai/provider-factory'
import { getDb } from '~/lib/db'
import { logger } from '~/lib/logger'

const BodySchema = z.object({
	messages: z.array(z.unknown()).max(200).optional().default([]),
	modelId: z.string().trim().min(1).optional(),
	maxTokens: z.number().int().min(1).max(4096).optional(),
	temperature: z.number().min(0).max(2).optional(),
})

function appendResponseCookies(res: Response, cookies: string[]) {
	for (const cookie of cookies) {
		res.headers.append('Set-Cookie', cookie)
	}
}

function errorMatches(error: unknown, needle: string) {
	const message = error instanceof Error ? error.message : String(error)
	if (message.includes(needle)) return true
	const cause =
		error instanceof Error ? (error as { cause?: unknown }).cause : undefined
	const causeMessage =
		cause instanceof Error ? cause.message : String(cause ?? '')
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

export async function handleAgentChatStreamRequest(
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

	const context = await buildRequestContext(request)
	if (!context.auth.user) {
		const res = Response.json({ error: 'unauthorized' }, { status: 401 })
		appendResponseCookies(res, context.responseCookies)
		return res
	}

	const bodyText = await request.text()
	let input: z.infer<typeof BodySchema>
	try {
		input = BodySchema.parse(JSON.parse(bodyText))
	} catch (err) {
		const message = err instanceof Error ? err.message : 'bad request'
		return Response.json({ error: message }, { status: 400 })
	}

	const resolvedModelId = input.modelId?.trim()
	if (resolvedModelId) {
		const enabled = await isEnabledModel(
			'llm' as AIProviderKind,
			resolvedModelId,
		)
		if (!enabled) {
			return Response.json(
				{ error: 'Selected LLM model is not enabled' },
				{ status: 400 },
			)
		}
	}

	const defaultModel = resolvedModelId
		? null
		: await getDefaultAiModel('llm' as AIProviderKind)
	const modelId = resolvedModelId ?? defaultModel?.id
	if (!modelId) {
		return Response.json(
			{ error: 'No enabled LLM model is configured' },
			{ status: 400 },
		)
	}

	const cfg = await getAiModelConfig(modelId)
	if (!cfg || cfg.kind !== 'llm') {
		return Response.json({ error: 'model not found' }, { status: 404 })
	}
	if (!cfg.enabled || !cfg.provider.enabled) {
		return Response.json({ error: 'model disabled' }, { status: 400 })
	}

	const system = [
		'You are a helpful assistant inside a media workflow product.',
		'You MUST NOT execute downloads, ASR, optimization, translation, or rendering directly.',
		'Instead, propose exactly one next action by calling one of the propose* tools.',
		'If the user message does not contain enough information to propose a safe next step, ask a clarifying question.',
		'Be concise and practical.',
	].join(' ')

	try {
		const providerClient = getProviderClient(cfg.provider)
		const model = providerClient(cfg.remoteModelId)

		const tools = {
			proposeDownload: {
				description:
					'Create a user-confirmable proposal to start a cloud download for a YouTube/TikTok URL. This does not execute the download.',
				inputSchema: z.object({
					url: z.string().url(),
					quality: z.enum(['1080p', '720p']).optional(),
					proxyId: z.string().optional().nullable(),
				}),
				execute: async (args: {
					url: string
					quality?: '1080p' | '720p'
					proxyId?: string | null
				}) => {
					const action = await proposeDownloadAction({
						userId: context.auth.user!.id,
						url: args.url,
						quality: args.quality,
						proxyId: args.proxyId ?? null,
					})
					return { actionId: action.id, action }
				},
			},
			proposeAsr: {
				description:
					'Create a user-confirmable proposal to run ASR on an existing mediaId. This does not execute ASR.',
				inputSchema: z.object({
					mediaId: z.string().min(1),
					modelId: z.string().optional().nullable(),
					language: z.string().min(2).max(16).optional(),
				}),
				execute: async (args: {
					mediaId: string
					modelId?: string | null
					language?: string
				}) => {
					const action = await proposeAsrAction({
						userId: context.auth.user!.id,
						mediaId: args.mediaId,
						modelId: args.modelId ?? null,
						language: args.language,
					})
					return { actionId: action.id, action }
				},
			},
			proposeOptimize: {
				description:
					'Create a user-confirmable proposal to optimize subtitles segmentation for a mediaId. Uses safe defaults. This does not execute optimization.',
				inputSchema: z.object({
					mediaId: z.string().min(1),
					modelId: z.string().optional().nullable(),
				}),
				execute: async (args: { mediaId: string; modelId?: string | null }) => {
					const action = await proposeOptimizeAction({
						userId: context.auth.user!.id,
						mediaId: args.mediaId,
						modelId: args.modelId ?? null,
					})
					return { actionId: action.id, action }
				},
			},
			proposeTranslate: {
				description:
					'Create a user-confirmable proposal to translate subtitles to zh-CN and output bilingual VTT for a mediaId. This does not execute translation.',
				inputSchema: z.object({
					mediaId: z.string().min(1),
					modelId: z.string().optional().nullable(),
					promptId: z.string().optional(),
				}),
				execute: async (args: {
					mediaId: string
					modelId?: string | null
					promptId?: string
				}) => {
					const action = await proposeTranslateAction({
						userId: context.auth.user!.id,
						mediaId: args.mediaId,
						modelId: args.modelId ?? null,
						promptId: args.promptId,
					})
					return { actionId: action.id, action }
				},
			},
			proposeRender: {
				description:
					'Create a user-confirmable proposal to render (burn-in) subtitles for a mediaId. This does not execute rendering.',
				inputSchema: z.object({
					mediaId: z.string().min(1),
				}),
				execute: async (args: { mediaId: string }) => {
					const action = await proposeRenderAction({
						userId: context.auth.user!.id,
						mediaId: args.mediaId,
					})
					return { actionId: action.id, action }
				},
			},
		} as const

		const agent = new ToolLoopAgent({
			model,
			instructions: system,
			maxOutputTokens: input.maxTokens,
			temperature: input.temperature,
			tools: tools as any,
			stopWhen: stepCountIs(1),
		})

		const res = await createAgentUIStreamResponse({
			agent,
			uiMessages: input.messages as unknown[],
			abortSignal: request.signal,
			headers: {
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff',
			},
			onError: (error) => {
				const message = error instanceof Error ? error.message : String(error)
				if (message.startsWith('D1_BINDING_MISSING')) {
					return 'Server database binding is missing. For full workflow features, use `pnpm dev:web` (Wrangler runtime) instead of Vite dev.'
				}
				return message
			},
		})

		appendResponseCookies(res, context.responseCookies)
		return res
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err))
		const message = error.message
		const causeMessage =
			error.cause instanceof Error
				? error.cause.message
				: error.cause
					? String(error.cause)
					: null

		logger.error(
			'api',
			`[agent.chat-stream] failed msg=${message}${causeMessage ? ` cause=${causeMessage}` : ''}`,
		)

		return Response.json(
			{ error: 'failed to generate response' },
			{ status: 500 },
		)
	}
}
