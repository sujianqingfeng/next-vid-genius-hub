'use client'

import { Languages } from 'lucide-react'
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'

function getCurrentLocale(locale: string): Locale {
	return SUPPORTED_LOCALES.includes(locale as Locale) ? (locale as Locale) : 'zh'
}

function getNextLocale(current: Locale): Locale {
	const index = SUPPORTED_LOCALES.indexOf(current)
	if (index === -1) return SUPPORTED_LOCALES[0]
	return SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]
}

export function HomeLanguageToggle() {
	const router = useRouter()
	const locale = getCurrentLocale(useLocale())
	const t = useTranslations('Common')
	const [isPending, startTransition] = useTransition()

	function handleChange(nextLocale: Locale) {
		if (nextLocale === locale || isPending) return

		startTransition(() => {
			// Ensure cookie is set on the client as a fallback for runtimes
			// where mutating cookies() on the server might not be supported.
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

	const nextLocale = getNextLocale(locale)
	const currentLabel = t(`language.${locale}`)
	const nextLabel = t(`language.${nextLocale}`)

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-9 w-9 rounded-full"
					onClick={() => handleChange(nextLocale)}
					disabled={isPending}
					aria-label={`${currentLabel} → ${nextLabel}`}
				>
					<Languages className="h-5 w-5" strokeWidth={1.5} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<span>
					{currentLabel} → {nextLabel}
				</span>
			</TooltipContent>
		</Tooltip>
	)
}

