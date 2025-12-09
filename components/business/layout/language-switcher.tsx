'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setLocale } from '~/app/(workspace)/_actions/set-locale'
import { Button } from '~/components/ui/button'
import {
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
	type Locale,
} from '~/i18n/config'

function getCurrentLocale(locale: string): Locale {
	return SUPPORTED_LOCALES.includes(locale as Locale) ? (locale as Locale) : 'zh'
}

export function LanguageSwitcher({ collapsed = false }: { collapsed?: boolean }) {
	const router = useRouter()
	const locale = getCurrentLocale(useLocale())
	const t = useTranslations('Common')
	const [isPending, startTransition] = useTransition()

	function handleChange(nextLocale: Locale) {
		if (nextLocale === locale || isPending) return

		startTransition(() => {
			// Client-side fallback to ensure cookie is set even if server runtime
			// does not support mutating cookies() (e.g., some edge runtimes).
			if (typeof document !== 'undefined') {
				document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=${
					60 * 60 * 24 * 365
				}`
			}

			void setLocale(nextLocale).finally(() => {
				// Refresh to pull the new locale from cookies on the server.
				router.refresh()
			})
		})
	}

	if (collapsed) {
		return (
			<div className="flex justify-center gap-2">
				{SUPPORTED_LOCALES.map((item) => (
					<Button
						key={item}
						variant={locale === item ? 'secondary' : 'ghost'}
						size="icon"
						className="text-xs uppercase"
						onClick={() => handleChange(item)}
						disabled={isPending}
						aria-pressed={locale === item}
						aria-label={t(`language.${item}`)}
					>
						{item}
					</Button>
				))}
			</div>
		)
	}

	return (
		<div className="flex items-center justify-between gap-2 rounded-xl bg-sidebar-accent/50 px-3 py-2 ring-1 ring-sidebar-border/40">
			{SUPPORTED_LOCALES.map((item) => (
				<Button
					key={item}
					variant={locale === item ? 'secondary' : 'ghost'}
					size="sm"
					className="flex-1"
					onClick={() => handleChange(item)}
					disabled={isPending}
					aria-pressed={locale === item}
				>
					{t(`language.${item}`)}
				</Button>
			))}
		</div>
	)
}
