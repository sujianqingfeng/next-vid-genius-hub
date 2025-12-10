'use client'

import { Languages } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setLocale } from '~/app/(workspace)/_actions/set-locale'
import { Button } from '~/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import {
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
	type Locale,
} from '~/i18n/config'

function getCurrentLocale(locale: string): Locale {
	return SUPPORTED_LOCALES.includes(locale as Locale) ? (locale as Locale) : 'zh'
}

function getNextLocale(current: Locale): Locale {
	const index = SUPPORTED_LOCALES.indexOf(current)
	if (index === -1) return SUPPORTED_LOCALES[0]
	return SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]
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

	const nextLocale = getNextLocale(locale)
	const currentLabel = t(`language.${locale}`)
	const nextLabel = t(`language.${nextLocale}`)

	const toggleButton = (
		<Button
			type="button"
			variant="ghost"
			size={collapsed ? 'icon' : 'sm'}
			className={
				collapsed
					? 'h-8 w-8 rounded-full'
					: 'h-8 w-9 rounded-full justify-center px-0'
			}
			onClick={() => handleChange(nextLocale)}
			disabled={isPending}
			aria-label={`${currentLabel} → ${nextLabel}`}
		>
			<span className="text-[11px] font-semibold uppercase">
				{locale === 'zh' ? '中' : 'En'}
			</span>
		</Button>
	)

	if (collapsed) {
		return (
			<div className="flex justify-center">
				<Tooltip>
					<TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
					<TooltipContent side="right">
						<span>
							{currentLabel} → {nextLabel}
						</span>
					</TooltipContent>
				</Tooltip>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-between gap-2 rounded-xl bg-sidebar-accent/50 px-3 py-2 ring-1 ring-sidebar-border/40">
			<div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
				<Languages className="h-4 w-4" strokeWidth={1.5} />
				<span className="truncate">{currentLabel}</span>
			</div>
			<Tooltip>
				<TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
				<TooltipContent side="top">
					<span>
						{currentLabel} → {nextLabel}
					</span>
				</TooltipContent>
			</Tooltip>
		</div>
	)
}
