import { z } from 'zod'

/**
 * ASR（Whisper / Workers AI）模型与转录 Provider 配置
 *
 * 注意：
 * - 后端实际可用 ASR 模型来源于 DB（ai_models.kind='asr'）。
 * - 这里保留一份 Cloudflare Workers AI 的默认/兜底列表，供客户端在未拉取动态列表时使用。
 */

export const TRANSCRIPTION_PROVIDERS = ['cloudflare'] as const
export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number]

// Cloudflare Workers AI run ids (legacy fallback list)
export const WHISPER_MODEL_IDS = [
	'@cf/openai/whisper-tiny-en',
	'@cf/openai/whisper-large-v3-turbo',
	'@cf/openai/whisper',
] as const

// Runtime ASR model IDs are DB-configurable; keep legacy list for fallback/UI only.
export type WhisperModel = string

export type CloudflareInputFormat = 'binary' | 'array' | 'base64'

export interface WhisperModelConfig {
	id: WhisperModel
	label: string
	description: string
	providers: TranscriptionProvider[]
	isDefault?: boolean
	supportsLanguageHint?: boolean
	cloudflareInputFormat?: CloudflareInputFormat
}

/**
 * 所有支持的 ASR 模型兜底配置
 */
export const WHISPER_MODELS: Record<WhisperModel, WhisperModelConfig> = {
	'@cf/openai/whisper-tiny-en': {
		id: '@cf/openai/whisper-tiny-en',
		label: 'Whisper Tiny (EN)',
		description: 'Fast, English only',
		providers: ['cloudflare'],
		isDefault: true,
		cloudflareInputFormat: 'binary',
	},
	'@cf/openai/whisper-large-v3-turbo': {
		id: '@cf/openai/whisper-large-v3-turbo',
		label: 'Whisper Large v3 Turbo',
		description: 'High quality, faster processing',
		providers: ['cloudflare'],
		supportsLanguageHint: true,
		cloudflareInputFormat: 'base64',
	},
	'@cf/openai/whisper': {
		id: '@cf/openai/whisper',
		label: 'Whisper (Medium)',
		description: 'Balanced quality and speed',
		providers: ['cloudflare'],
		cloudflareInputFormat: 'binary',
	},
} as const

/**
 * Zod Schemas（供 ORPC / 表单等层复用）
 */
export const transcriptionProviderSchema = z.enum(TRANSCRIPTION_PROVIDERS)

export const whisperModelSchema = z.enum(WHISPER_MODEL_IDS)
export const CLOUDFLARE_INPUT_FORMAT_VALUES = ['binary', 'array', 'base64'] as const
export const cloudflareInputFormatSchema = z.enum(CLOUDFLARE_INPUT_FORMAT_VALUES)

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
