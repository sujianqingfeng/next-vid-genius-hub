import { deepseekModels } from './deepseek'
import { openaiModels } from './openai'

export const models = [...openaiModels, ...deepseekModels] as const

export type AIModelId = (typeof models)[number]['id']

export const AIModelIds = models.map((m) => m.id)
