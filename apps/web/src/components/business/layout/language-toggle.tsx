import { useCallback } from 'react'
import { setLocaleCookie, type Locale, useLocale } from '~/lib/i18n'
import { cn } from '~/lib/utils'

interface LanguageToggleProps {
	collapsed?: boolean
	className?: string
}

export default function LanguageToggle({
	collapsed,
	className,
}: LanguageToggleProps) {
	const locale = useLocale()

	const setLocale = useCallback((next: Locale) => {
		setLocaleCookie(next)
		window.location.reload()
	}, [])

	const toggle = useCallback(() => {
		setLocale(locale === 'en' ? 'zh' : 'en')
	}, [locale, setLocale])

	if (collapsed) {
		return (
			<button
				type="button"
				onClick={toggle}
				className={cn(
					'flex h-8 w-8 items-center justify-center border border-border bg-background text-xs font-bold font-mono hover:bg-secondary transition-colors',
					className,
				)}
				title={locale === 'en' ? 'Switch to Chinese' : 'Switch to English'}
			>
				{locale === 'en' ? 'EN' : 'ZH'}
			</button>
		)
	}

	return (
		<div
			className={cn(
				'inline-flex border border-border bg-background p-0.5',
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setLocale('zh')}
				data-active={locale === 'zh'}
				className="px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary/50 data-[active=true]:bg-secondary data-[active=true]:text-foreground data-[active=true]:font-bold text-muted-foreground"
			>
				中文
			</button>
			<div className="w-[1px] bg-border my-0.5" />
			<button
				type="button"
				onClick={() => setLocale('en')}
				data-active={locale === 'en'}
				className="px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary/50 data-[active=true]:bg-secondary data-[active=true]:text-foreground data-[active=true]:font-bold text-muted-foreground"
			>
				EN
			</button>
		</div>
	)
}
