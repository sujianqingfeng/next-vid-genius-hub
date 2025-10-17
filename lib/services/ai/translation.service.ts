import type { AIModelId } from '~/lib/ai/models'
import { translateText } from '~/lib/ai/translate'
import { getLanguageOptions } from '~/lib/constants/languages'

export interface TranslationRequest {
	text: string
	from?: string
	to: string
	model?: AIModelId
}

export interface TranslationResult {
	translatedText: string
	from: string
	to: string
	model: AIModelId
	confidence?: number
}

export class TranslationService {
	private readonly defaultModel: AIModelId = 'openai/gpt-4.1-mini'

	/**
	 * 翻译文本
	 */
	async translate(request: TranslationRequest): Promise<TranslationResult> {
		try {
			const { text, from, to, model = this.defaultModel } = request

			if (!text || !text.trim()) {
				throw new Error('Text cannot be empty')
			}

			if (!to) {
				throw new Error('Target language is required')
			}

			// TODO: Implement proper translation with language parameters
			const translatedText = await translateText(text, model || 'openai/gpt-4.1-mini')

			return {
				translatedText,
				from: from || 'auto-detected',
				to,
				model,
				confidence: undefined // 可以根据模型实现添加置信度
			}
		} catch (error) {
			console.error('Translation failed:', error)
			throw new Error(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 批量翻译
	 */
	async batchTranslate(
		requests: TranslationRequest[],
		onProgress?: (current: number, total: number) => void
	): Promise<TranslationResult[]> {
		const results: TranslationResult[] = []

		for (let i = 0; i < requests.length; i++) {
			const request = requests[i]

			try {
				const result = await this.translate(request)
				results.push(result)
			} catch (error) {
				console.error(`Failed to translate item ${i}:`, error)
				// 对于批量操作，我们可能不想因为一个失败而停止整个批次
				results.push({
					translatedText: request.text, // 返回原文作为后备
					from: request.from || 'unknown',
					to: request.to,
					model: request.model || this.defaultModel,
					confidence: 0
				})
			}

			// 报告进度
			if (onProgress) {
				onProgress(i + 1, requests.length)
			}
		}

		return results
	}

	/**
	 * 翻译字幕文件
	 */
	async translateSubtitles(
		subtitles: Array<{
			index: number
			startTime: string
			endTime: string
			text: string
		}>,
		targetLanguage: string,
		options: {
			from?: string
			model?: AIModelId
			preserveFormatting?: boolean
		} = {}
	): Promise<Array<{
		index: number
		startTime: string
		endTime: string
		text: string
		translatedText: string
	}>> {
		const { from, model, preserveFormatting = true } = options

		// 提取需要翻译的文本
		const textsToTranslate = subtitles.map(sub => sub.text).filter(text => text && text.trim())

		if (textsToTranslate.length === 0) {
			return subtitles.map(sub => ({
				...sub,
				translatedText: sub.text
			}))
		}

		try {
			// 批量翻译
			const translationRequests: TranslationRequest[] = textsToTranslate.map(text => ({
				text,
				from,
				to: targetLanguage,
				model
			}))

			const translatedTexts = await this.batchTranslate(translationRequests)

			// 将翻译结果映射回字幕
			let translationIndex = 0
			const result = subtitles.map(subtitle => {
				if (subtitle.text && subtitle.text.trim()) {
					const translatedText = translatedTexts[translationIndex]?.translatedText || subtitle.text
					translationIndex++

					return {
						...subtitle,
						translatedText: preserveFormatting ? this.preserveFormatting(subtitle.text, translatedText) : translatedText
					}
				}

				return {
					...subtitle,
					translatedText: subtitle.text
				}
			})

			return result
		} catch (error) {
			console.error('Subtitle translation failed:', error)
			throw new Error(`Subtitle translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 检测文本语言
	 */
	async detectLanguage(text: string): Promise<{
		language: string
		confidence: number
	}> {
		try {
			// 这里可以实现语言检测逻辑
			// 可以使用专门的语言检测API或AI模型

			// 简单的实现：基于常见语言的关键词检测
			const languagePatterns = {
				'en': /\b(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|two|way|who|will|with|your)\b/i,
				'zh': /[\u4e00-\u9fff]/,
				'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
				'ko': /[\uac00-\ud7af]/,
				'es': /\b(el|la|de|que|y|a|en|un|es|se|no|te|lo|le|da|su|por|son|con|para|como|las|del|los|una|mi|sus|al|me|si|ya|todo|esta|esto|esto|esta|están|sus|les|ni|bien|asi|pues|solo|aquí|toda|todas|hasta|hacia|desde|donde|cuando|como|cuanto|porqué|porque)\b/i,
				'fr': /\b(le|de|et|à|un|il|être|et|en|avoir|que|pour|dans|ce|son|une|sur|avec|ne|se|pas|tout|plus|par|grand|en|être|était|deux|mais|comme|bien|dans|savoir|pouvoir|aller|voir|non|vouloir|falloir|tenir|donner|venir|prendre|devoir|faire|mettre|partir|rester|trouver|entrer|sortir|arriver|passer|mourir|naître|devenir|regarder|penser|croire|dire|écrire)\b/i,
			}

			let detectedLanguage = 'unknown'
			let maxConfidence = 0

			for (const [lang, pattern] of Object.entries(languagePatterns)) {
				const matches = text.match(pattern)
				const confidence = matches ? matches.length / text.split(/\s+/).length : 0

				if (confidence > maxConfidence) {
					maxConfidence = confidence
					detectedLanguage = lang
				}
			}

			return {
				language: detectedLanguage,
				confidence: maxConfidence
			}
		} catch (error) {
			console.error('Language detection failed:', error)
			return {
				language: 'unknown',
				confidence: 0
			}
		}
	}

	/**
	 * 验证翻译质量
	 */
    async validateTranslation(
        originalText: string,
        translatedText: string,
        _targetLanguage: string
    ): Promise<{
		isValid: boolean
		confidence: number
		issues: string[]
	}> {
        try {
            void _targetLanguage
            const issues: string[] = []
            let confidence = 1.0

			// 基本验证
			if (!translatedText || !translatedText.trim()) {
				issues.push('Translated text is empty')
				confidence -= 0.5
			}

			// 长度检查（翻译结果长度应该与原文相近）
			const lengthRatio = translatedText.length / originalText.length
			if (lengthRatio < 0.3 || lengthRatio > 3) {
				issues.push('Translation length seems unreasonable')
				confidence -= 0.2
			}

			// 检查是否有未翻译的内容（简单检查）
			if (originalText === translatedText) {
				issues.push('Text appears to be untranslated')
				confidence -= 0.8
			}

			// 检查是否包含错误标记或占位符
			if (translatedText.includes('[翻译失败]') || translatedText.includes('[TRANSLATION FAILED]')) {
				issues.push('Translation contains error markers')
				confidence -= 0.6
			}

			return {
				isValid: confidence > 0.5,
				confidence: Math.max(0, confidence),
				issues
			}
		} catch (error) {
			console.error('Translation validation failed:', error)
			return {
				isValid: false,
				confidence: 0,
				issues: ['Validation failed']
			}
		}
	}

	/**
	 * 获取支持的语言列表
	 */
	getSupportedLanguages(): Array<{
		code: string
		name: string
		nativeName: string
	}> {
		return getLanguageOptions()
	}

	private preserveFormatting(originalText: string, translatedText: string): string {
		// 保留常见的格式标记
		const formattingPatterns = [
			// HTML 标签
			/<[^>]*>/g,
			// Markdown 链接
			/\[([^\]]+)\]\(([^)]+)\)/g,
			// 粗体和斜体
			/\*\*([^*]+)\*\*/g,
			/\*([^*]+)\*/g,
			// 时间戳格式
			/\d{1,2}:\d{2}:\d{2},\d{3}/g,
		]

		let result = translatedText

		// 提取原始文本中的格式标记
		const extractedFormats: string[] = []
		let tempOriginal = originalText

		formattingPatterns.forEach(pattern => {
			const matches = tempOriginal.match(pattern)
			if (matches) {
				extractedFormats.push(...matches)
				// 从临时文本中移除已匹配的格式
				tempOriginal = tempOriginal.replace(pattern, '')
			}
		})

		// 尝试将格式重新应用到翻译结果中
		// 这是一个简化的实现，实际应用中可能需要更复杂的逻辑
		extractedFormats.forEach(format => {
			if (format.includes('<')) {
				// HTML 格式 - 简单地在结果中添加
				if (format.includes('<b>') || format.includes('<strong>')) {
					result = result.replace(/^(.+)$/, `<strong>$1</strong>`)
				}
			} else if (format.includes('**')) {
				// Markdown 粗体
				result = result.replace(/^(.+)$/, `**$1**`)
			}
		})

		return result
	}
}

// 单例实例
export const translationService = new TranslationService()
