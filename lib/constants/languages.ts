export type LanguageOption = {
  code: string
  name: string
  nativeName: string
}

const BASE_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
]

const AUTO_LANGUAGE: LanguageOption = {
  code: 'auto',
  name: 'Auto-detect',
  nativeName: 'Auto-detect',
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [...BASE_LANGUAGES]

export const LANGUAGE_OPTIONS_WITH_AUTO: LanguageOption[] = [
  AUTO_LANGUAGE,
  ...BASE_LANGUAGES,
]

export function getLanguageOptions(options?: { includeAuto?: boolean }): LanguageOption[] {
  if (options?.includeAuto) {
    return LANGUAGE_OPTIONS_WITH_AUTO.map((lang) => ({ ...lang }))
  }
  return LANGUAGE_OPTIONS.map((lang) => ({ ...lang }))
}
