import { deepseekModels } from './deepseek'
import { openaiModels } from './openai'

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

export const models = [...openaiModels, ...deepseekModels, ...whisperModels] as const

export type AIModelId = (typeof models)[number]['id']
export type WhisperModelId = (typeof whisperModels)[number]['id']

export const AIModelIds = models.map((m) => m.id)
export const WhisperModelIds = whisperModels.map((m) => m.id)

// 便捷访问器
export const getChatModels = () => models.filter(m => 'modelName' in m)
export const getTranslationModels = () => models.filter(m => 'modelName' in m)
export const getTranscriptionModels = () => whisperModels

// Language model IDs only (excluding Whisper)
export const ChatModelIds = [...openaiModels, ...deepseekModels].map((m) => m.id)
export type ChatModelId = (typeof openaiModels)[number]['id'] | (typeof deepseekModels)[number]['id']
export const getDefaultChatModel = () => models.find(m => 'modelName' in m && m.id.includes('mini')) || getChatModels()[0]
export const getDefaultTranslationModel = () => models.find(m => 'modelName' in m && m.id.includes('mini')) || getTranslationModels()[0]
export const getDefaultTranscriptionModel = () => whisperModels[0] // Default to first whisper model
