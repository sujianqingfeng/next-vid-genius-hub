export const TRANSCRIPTION_LANGUAGE_OPTIONS = [
	{ value: 'auto' },
	{ value: 'zh' },
	{ value: 'yue' },
	{ value: 'en' },
	{ value: 'ja' },
	{ value: 'ko' },
	{ value: 'es' },
	{ value: 'fr' },
	{ value: 'de' },
	{ value: 'pt' },
	{ value: 'hi' },
	{ value: 'id' },
] as const

export type TranscriptionLanguage =
	(typeof TRANSCRIPTION_LANGUAGE_OPTIONS)[number]['value']

export const DEFAULT_TRANSCRIPTION_LANGUAGE: TranscriptionLanguage = 'auto'

export function normalizeTranscriptionLanguage(
	value?: string | null,
): TranscriptionLanguage {
	if (!value) return DEFAULT_TRANSCRIPTION_LANGUAGE
	const found = TRANSCRIPTION_LANGUAGE_OPTIONS.find(
		(opt) => opt.value === value,
	)
	return found ? found.value : DEFAULT_TRANSCRIPTION_LANGUAGE
}
