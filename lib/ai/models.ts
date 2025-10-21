import { deepseekModels } from './deepseek'
import { openaiModels } from './openai'
import { packycodeModels } from './packycode'

// Whisper 转录模型
export const whisperModels = [
	{
		id: 'whisper-1',
		name: 'Whisper v1',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-large-v3-turbo',
		name: 'Whisper Large v3 Turbo',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-large-v3',
		name: 'Whisper Large v3',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-medium',
		name: 'Whisper Medium',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-small',
		name: 'Whisper Small',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-tiny',
		name: 'Whisper Tiny',
		provider: 'openai',
		languages: 'multilingual',
	},
	{
		id: 'whisper-tiny-en',
		name: 'Whisper Tiny (English)',
		provider: 'openai',
		languages: 'english',
	},
] as const

export const models = [
	...openaiModels,
	...deepseekModels,
	...packycodeModels,
	...whisperModels,
] as const

export type AIModelId = (typeof models)[number]['id']

export const AIModelIds = models.map((m) => m.id)

export const ChatModelIds = [
	...openaiModels,
	...deepseekModels,
	...packycodeModels,
].map((m) => m.id)

export type ChatModelId =
	| (typeof openaiModels)[number]['id']
	| (typeof deepseekModels)[number]['id']
	| (typeof packycodeModels)[number]['id']
