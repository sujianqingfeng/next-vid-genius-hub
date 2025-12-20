import { useCallback } from 'react'
import type { Locale } from '~/i18n/config'
import { setLocaleCookie, useLocale } from '../integrations/i18n'

export default function LanguageToggle() {
	const locale = useLocale()

	const setLocale = useCallback((next: Locale) => {
		setLocaleCookie(next)
		window.location.reload()
	}, [])

	return (
		<div className="inline-flex items-center gap-1 rounded-lg border bg-background p-1 text-sm">
			<button
				type="button"
				onClick={() => setLocale('zh')}
				data-active={locale === 'zh'}
				className="rounded-md px-2 py-1 data-[active=true]:bg-secondary"
			>
				中文
			</button>
			<button
				type="button"
				onClick={() => setLocale('en')}
				data-active={locale === 'en'}
				className="rounded-md px-2 py-1 data-[active=true]:bg-secondary"
			>
				EN
			</button>
		</div>
	)
}
