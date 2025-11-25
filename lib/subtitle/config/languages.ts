export const TRANSCRIPTION_LANGUAGE_OPTIONS = [
	{ value: 'auto', label: '自动检测（Auto Detect）' },
	{ value: 'zh', label: '中文（普通话）' },
	{ value: 'yue', label: '中文（粤语）' },
	{ value: 'en', label: 'English' },
	{ value: 'ja', label: '日本語' },
	{ value: 'ko', label: '한국어' },
	{ value: 'es', label: 'Español' },
	{ value: 'fr', label: 'Français' },
	{ value: 'de', label: 'Deutsch' },
	{ value: 'pt', label: 'Português' },
	{ value: 'hi', label: 'हिन्दी' },
	{ value: 'id', label: 'Bahasa Indonesia' },
] as const

export type TranscriptionLanguage =
	(typeof TRANSCRIPTION_LANGUAGE_OPTIONS)[number]['value']

export const DEFAULT_TRANSCRIPTION_LANGUAGE: TranscriptionLanguage = 'auto'

export function normalizeTranscriptionLanguage(
	value?: string | null,
): TranscriptionLanguage {
	if (!value) return DEFAULT_TRANSCRIPTION_LANGUAGE
	const found = TRANSCRIPTION_LANGUAGE_OPTIONS.find((opt) => opt.value === value)
	return found ? found.value : DEFAULT_TRANSCRIPTION_LANGUAGE
}
