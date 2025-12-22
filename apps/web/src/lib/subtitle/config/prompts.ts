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
	template: `You are a professional subtitle translator. Input is a WebVTT file in any source language.

Rules:
1) Keep the WEBVTT header and all timestamp lines EXACTLY as-is.
2) Keep every original text line EXACTLY as-is (whatever the source language). Do NOT paraphrase, rewrite, or translate it.
3) Immediately after each original text line, add ONE line of faithful Simplified Chinese translation of that original line.
4) NEVER output English, transliteration, phonetic spelling, or any other language in the translation line. The translation line must be Chinese only.
5) If the original is already Chinese, repeat the same Chinese on the translation line; do not add extra languages.
6) Do NOT add dashes (-), bullets, or punctuation at the end of lines. Preserve line breaks exactly.
7) Output ONLY the WebVTT content. No explanations, summaries, or code fences.

Example (Korean):
WEBVTT

00.000 --> 02.000
안녕하세요
你好

02.000 --> 04.000
테스트입니다
这是一个测试`,
}

/**
 * 获取翻译提示词
 */
export function getTranslationPrompt(
	promptId: string,
): TranslationPrompt | undefined {
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
