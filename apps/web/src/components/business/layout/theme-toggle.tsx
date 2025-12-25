import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '~/lib/theme'
import { cn } from '~/lib/utils'

interface ThemeToggleProps {
	collapsed?: boolean
	className?: string
}

export default function ThemeToggle({ collapsed, className }: ThemeToggleProps) {
	const { theme, setTheme } = useTheme()

	if (collapsed) {
		const nextTheme: Record<Theme, Theme> = {
			light: 'dark',
			dark: 'system',
			system: 'light',
		}
		
		const Icon = {
			light: Sun,
			dark: Moon,
			system: Monitor,
		}[theme]

		return (
			<button
				type="button"
				onClick={() => setTheme(nextTheme[theme])}
				className={cn(
					"flex h-8 w-8 items-center justify-center border border-border bg-background text-foreground hover:bg-secondary transition-colors",
					className
				)}
				title={`Current theme: ${theme}. Click to switch.`}
			>
				<Icon className="h-4 w-4" />
			</button>
		)
	}

	return (
		<div className={cn("inline-flex border border-border bg-background p-0.5", className)}>
			<button
				type="button"
				onClick={() => setTheme('light')}
				data-active={theme === 'light'}
				className="px-2 py-1 text-xs transition-colors hover:bg-secondary/50 data-[active=true]:bg-secondary data-[active=true]:text-foreground text-muted-foreground"
				title="Light Theme"
			>
				<Sun className="h-3.5 w-3.5" />
			</button>
			<div className="w-[1px] bg-border my-0.5" />
			<button
				type="button"
				onClick={() => setTheme('system')}
				data-active={theme === 'system'}
				className="px-2 py-1 text-xs transition-colors hover:bg-secondary/50 data-[active=true]:bg-secondary data-[active=true]:text-foreground text-muted-foreground"
				title="System Theme"
			>
				<Monitor className="h-3.5 w-3.5" />
			</button>
			<div className="w-[1px] bg-border my-0.5" />
			<button
				type="button"
				onClick={() => setTheme('dark')}
				data-active={theme === 'dark'}
				className="px-2 py-1 text-xs transition-colors hover:bg-secondary/50 data-[active=true]:bg-secondary data-[active=true]:text-foreground text-muted-foreground"
				title="Dark Theme"
			>
				<Moon className="h-3.5 w-3.5" />
			</button>
		</div>
	)
}
