import { streamText } from 'ai'
import { z } from 'zod'

import { buildRequestContext } from '~/lib/auth/context'
import type { AIProviderKind } from '~/lib/ai/config/service'
import {
	getAiModelConfig,
	getDefaultAiModel,
	isEnabledModel,
} from '~/lib/ai/config/service'
import { getProviderClient } from '~/lib/ai/provider-factory'
import { logger } from '~/lib/logger'

const ChatRoleSchema = z.enum(['user', 'assistant', 'system'])
const ChatMessageSchema = z.object({
	role: ChatRoleSchema,
	content: z.string().trim().min(1).max(10_000),
})

const BodySchema = z.object({
	messages: z.array(ChatMessageSchema).min(1).max(50),
	modelId: z.string().trim().min(1).optional(),
	maxTokens: z.number().int().min(1).max(4096).optional(),
	temperature: z.number().min(0).max(2).optional(),
})

function appendResponseCookies(res: Response, cookies: string[]) {
	for (const cookie of cookies) {
		res.headers.append('Set-Cookie', cookie)
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
		'You are a helpful assistant.',
		'Be concise and practical.',
	].join(' ')

	try {
		const providerClient = getProviderClient(cfg.provider)
		const model = providerClient(cfg.remoteModelId)

		const result = streamText({
			model,
			system,
			messages: input.messages as any,
			maxTokens: input.maxTokens,
			temperature: input.temperature,
			abortSignal: request.signal,
		})

		const res = result.toTextStreamResponse({
			headers: {
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff',
			},
		})

		appendResponseCookies(res, context.responseCookies)
		return res
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		logger.error('api', `[agent.chat-stream] failed msg=${message}`)
		return Response.json(
			{ error: 'failed to generate response' },
			{ status: 500 },
		)
	}
}
