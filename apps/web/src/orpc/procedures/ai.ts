import { ORPCError, os } from '@orpc/server'
import { z } from 'zod'
import {
	type AIProviderKind,
	getDefaultAiModel,
	isEnabledModel,
	listAiModels,
} from '~/lib/ai/config/service'
import { generateMessagesWithUsage } from '~/lib/ai/chat'

const KindSchema = z.enum(['llm', 'asr'])

export const listModels = os
	.input(
		z.object({
			kind: KindSchema,
			enabledOnly: z.boolean().optional().default(true),
		}),
	)
	.handler(async ({ input }) => {
		const items = await listAiModels({
			kind: input.kind as AIProviderKind,
			enabledOnly: input.enabledOnly,
		})
		return { items }
	})

export const getDefaultModel = os
	.input(z.object({ kind: KindSchema }))
	.handler(async ({ input }) => {
		const model = await getDefaultAiModel(input.kind as AIProviderKind)
		if (!model) return { model: null }

		// Never return provider credentials to the client.
		const { provider: _provider, ...safeModel } = model as any
		return { model: safeModel }
	})

const ChatRoleSchema = z.enum(['user', 'assistant', 'system'])
const ChatMessageSchema = z.object({
	role: ChatRoleSchema,
	content: z.string().trim().min(1).max(10_000),
})

export const chat = os
	.input(
		z.object({
			messages: z.array(ChatMessageSchema).min(1).max(50),
			modelId: z.string().trim().min(1).optional(),
			maxTokens: z.number().int().min(1).max(4096).optional(),
			temperature: z.number().min(0).max(2).optional(),
		}),
	)
	.handler(async ({ input }) => {
		const resolvedModelId = input.modelId?.trim()
		if (resolvedModelId) {
			const enabled = await isEnabledModel('llm', resolvedModelId)
			if (!enabled) {
				throw new ORPCError('INVALID_INPUT', {
					status: 400,
					message: 'Selected LLM model is not enabled',
					data: { reason: 'MODEL_NOT_ENABLED' },
				})
			}
		}

		const defaultModel = resolvedModelId
			? null
			: await getDefaultAiModel('llm' as AIProviderKind)
		const modelId = resolvedModelId ?? defaultModel?.id
		if (!modelId) {
			throw new ORPCError('INVALID_INPUT', {
				status: 400,
				message: 'No enabled LLM model is configured',
				data: { reason: 'NO_LLM_MODEL_CONFIGURED' },
			})
		}

		const system = [
			'You are a helpful assistant.',
			'Be concise and practical.',
		].join(' ')

		const res = await generateMessagesWithUsage({
			model: modelId,
			system,
			messages: input.messages as any,
			maxTokens: input.maxTokens,
			temperature: input.temperature,
		})

		return {
			modelId,
			text: res.text,
			usage: res.usage,
		}
	})
