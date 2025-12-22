import { os } from '@orpc/server'
import { z } from 'zod'
import {
	type AIProviderKind,
	getDefaultAiModel,
	listAiModels,
} from '~/lib/ai/config/service'

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
		return { model }
	})
