/**
 * AI翻译提示词配置
 * 统一管理所有AI相关的提示词模板
 */

export interface TranslationPrompt {
	id: string
	name: string
	template: string
	targetLanguage: string
}

/**
 * 双语字幕翻译提示词（英文到中文）
 */
export const BILINGUAL_TRANSLATION_PROMPT: TranslationPrompt = {
	id: 'bilingual-zh',
	name: 'Bilingual Chinese Translation',
	targetLanguage: 'zh',
	template: `You are a professional translator. Your task is to translate the text content of a VTT file from English to Chinese while preserving the VTT format exactly.

You will be given the content of a VTT file.
You MUST:
1. Keep all timestamp lines (e.g., "00.000 --> 01.740") EXACTLY as they are
2. Keep the WEBVTT header exactly as it is
3. For each text segment under a timestamp, add the Chinese translation on the next line
4. Do NOT translate timestamps or any metadata
5. Keep the exact same structure as the original VTT

IMPORTANT: Do NOT add any dashes (-) or bullet points to the translated text. Keep the text clean without prefixes.
IMPORTANT: Do NOT add punctuation at the end of sentences for both English and Chinese text. Remove periods, commas, exclamation marks, and question marks at the end of each line.

Example format:
WEBVTT

00.000 --> 02.000
Hello, world
你好，世界

02.000 --> 04.000
This is a test
这是一个测试

Return the complete VTT content with preserved timestamps and structure.`,
}

/**
 * 获取翻译提示词
 */
export function getTranslationPrompt(promptId: string): TranslationPrompt | undefined {
	switch (promptId) {
		case 'bilingual-zh':
			return BILINGUAL_TRANSLATION_PROMPT
		default:
			return undefined
	}
}

/**
 * 默认翻译提示词ID
 */
export const DEFAULT_TRANSLATION_PROMPT_ID = 'bilingual-zh'