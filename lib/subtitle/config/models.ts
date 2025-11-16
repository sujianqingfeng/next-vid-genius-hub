import { z } from 'zod'

/**
 * Whisper 模型与转录 Provider 配置
 * 统一管理所有转录相关的模型定义和配置（包括 Zod Schema）
 */

export const TRANSCRIPTION_PROVIDERS = ['local', 'cloudflare'] as const
export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number]

export const WHISPER_MODEL_IDS = [
	'whisper-large',
	'whisper-medium',
	'whisper-tiny-en',
	'whisper-large-v3-turbo',
] as const

export type WhisperModel = (typeof WHISPER_MODEL_IDS)[number]

export interface WhisperModelConfig {
	id: WhisperModel
	label: string
	description: string
	providers: TranscriptionProvider[]
	isDefault?: boolean
}

/**
 * 所有支持的Whisper模型配置
 */
export const WHISPER_MODELS: Record<WhisperModel, WhisperModelConfig> = {
	'whisper-large': {
		id: 'whisper-large',
		label: 'Whisper Large',
		description: 'Best quality, slower processing',
		providers: ['local'],
	},
	'whisper-medium': {
		id: 'whisper-medium',
		label: 'Whisper Medium',
		description: 'Balanced quality and speed',
		providers: ['local', 'cloudflare'],
		isDefault: true,
	},
	'whisper-tiny-en': {
		id: 'whisper-tiny-en',
		label: 'Whisper Tiny (EN)',
		description: 'Fast, English only',
		providers: ['cloudflare'],
	},
	'whisper-large-v3-turbo': {
		id: 'whisper-large-v3-turbo',
		label: 'Whisper Large v3 Turbo',
		description: 'High quality, faster processing',
		providers: ['cloudflare'],
	},
} as const

/**
 * Zod Schemas（供 ORPC / 表单等层复用）
 */
export const transcriptionProviderSchema = z.enum(TRANSCRIPTION_PROVIDERS)

export const whisperModelSchema = z.enum(WHISPER_MODEL_IDS)

/**
 * 根据提供商获取可用模型
 */
export function getAvailableModels(provider: TranscriptionProvider): WhisperModel[] {
	return Object.values(WHISPER_MODELS)
		.filter(model => model.providers.includes(provider))
		.map(model => model.id)
}

/**
 * 获取默认模型
 */
export function getDefaultModel(provider: TranscriptionProvider): WhisperModel {
	const availableModels = getAvailableModels(provider)
	const defaultModel = availableModels.find(modelId => WHISPER_MODELS[modelId].isDefault)
	return defaultModel || availableModels[0]
}

/**
 * 模型标签映射
 */
export function getModelLabel(model: WhisperModel): string {
	return WHISPER_MODELS[model]?.label || model
}

/**
 * 模型描述映射
 */
export function getModelDescription(model: WhisperModel): string {
	return WHISPER_MODELS[model]?.description || ''
}
