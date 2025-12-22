import * as React from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
	theme: Theme
	resolvedTheme: ResolvedTheme
	setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function isTheme(value: unknown): value is Theme {
	return value === 'light' || value === 'dark' || value === 'system'
}

function getSystemTheme(): ResolvedTheme {
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

function resolveTheme(theme: Theme, enableSystem: boolean): ResolvedTheme {
	if (theme === 'system') return enableSystem ? getSystemTheme() : 'light'
	return theme
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
	const root = document.documentElement
	root.classList.toggle('dark', resolvedTheme === 'dark')
	root.style.colorScheme = resolvedTheme
}

function disableTransitionsTemporarily() {
	const style = document.createElement('style')
	style.appendChild(
		document.createTextNode(
			'*{transition:none !important;animation:none !important;}',
		),
	)
	document.head.appendChild(style)

	void document.documentElement.offsetHeight

	return () => {
		requestAnimationFrame(() => {
			style.remove()
		})
	}
}

export function ThemeProvider({
	children,
	defaultTheme = 'system',
	storageKey = 'theme',
	enableSystem = true,
	disableTransitionOnChange = false,
}: {
	children: React.ReactNode
	defaultTheme?: Theme
	storageKey?: string
	enableSystem?: boolean
	disableTransitionOnChange?: boolean
}) {
	const [theme, setTheme] = React.useState<Theme>(defaultTheme)
	const [resolvedTheme, setResolvedTheme] =
		React.useState<ResolvedTheme>('light')
	const [isInitialized, setIsInitialized] = React.useState(false)

	React.useEffect(() => {
		try {
			const stored = localStorage.getItem(storageKey)
			if (isTheme(stored)) setTheme(stored)
		} catch {}
		setIsInitialized(true)
	}, [storageKey])

	React.useEffect(() => {
		const stopDisableTransitions = disableTransitionOnChange
			? disableTransitionsTemporarily()
			: undefined

		const resolved = resolveTheme(theme, enableSystem)
		setResolvedTheme(resolved)
		applyResolvedTheme(resolved)
		stopDisableTransitions?.()

		if (isInitialized) {
			try {
				localStorage.setItem(storageKey, theme)
			} catch {}
		}

		if (theme !== 'system' || !enableSystem) return

		const media = window.matchMedia('(prefers-color-scheme: dark)')

		const onChange = () => {
			const stopDisableTransitionsOnSystemChange = disableTransitionOnChange
				? disableTransitionsTemporarily()
				: undefined

			const nextResolved = resolveTheme('system', enableSystem)
			setResolvedTheme(nextResolved)
			applyResolvedTheme(nextResolved)
			stopDisableTransitionsOnSystemChange?.()
		}

		media.addEventListener?.('change', onChange)
		return () => {
			media.removeEventListener?.('change', onChange)
		}
	}, [
		theme,
		enableSystem,
		disableTransitionOnChange,
		storageKey,
		isInitialized,
	])

	const value = React.useMemo<ThemeContextValue>(
		() => ({
			theme,
			resolvedTheme,
			setTheme,
		}),
		[theme, resolvedTheme],
	)

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
	const ctx = React.useContext(ThemeContext)
	if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
	return ctx
}

export function ThemeScript({ storageKey = 'theme' }: { storageKey?: string }) {
	const script = `(function(){try{var k=${JSON.stringify(
		storageKey,
	)};var t=localStorage.getItem(k);var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var r=(t==='dark'||(t!=='light'&&m))?'dark':'light';var d=document.documentElement;d.classList.toggle('dark',r==='dark');d.style.colorScheme=r;}catch(e){}})();`

	return (
		<script
			// oxlint-disable-next-line react/no-danger: intentional early theme sync to avoid flash
			dangerouslySetInnerHTML={{ __html: script }}
		/>
	)
}
