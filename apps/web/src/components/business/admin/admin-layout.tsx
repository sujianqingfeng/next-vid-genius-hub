'use client'

import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import {
	ArrowLeft,
	Cpu,
	Globe,
	Layers,
	ListOrdered,
	LogOut,
	Shield,
	Users,
} from 'lucide-react'
import LanguageToggle from '~/components/business/layout/language-toggle'
import ThemeToggle from '~/components/business/layout/theme-toggle'
import { Button } from '~/components/ui/button'
import { useAuthQuery, useLogoutMutation } from '~/lib/features/auth/hooks'
import { useTranslations } from '~/lib/shared/i18n'
import { cn } from '~/lib/shared/utils'

const navItems = [
	{ key: 'users', href: '/admin/users', icon: Users },
	{ key: 'proxy', href: '/admin/proxy', icon: Globe },
	{ key: 'aiProviders', href: '/admin/ai-providers', icon: Layers },
	{ key: 'aiModels', href: '/admin/ai-models', icon: Cpu },
	{ key: 'pricing', href: '/admin/points-pricing', icon: Shield },
	{ key: 'jobEvents', href: '/admin/job-events', icon: ListOrdered },
] as const

function stripBasePath(pathname: string): string {
	const baseUrl =
		import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
			? import.meta.env.BASE_URL.replace(/\/$/, '')
			: ''
	return baseUrl && pathname.startsWith(baseUrl)
		? pathname.slice(baseUrl.length)
		: pathname
}

export function AdminLayout() {
	const t = useTranslations('Admin.layout')
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const { data: me } = useAuthQuery()
	const logoutMutation = useLogoutMutation({
		redirectTo: '/login',
	})

	const activeHref = (() => {
		const normalizedPath = stripBasePath(pathname)
		let best: string | null = null

		for (const item of navItems) {
			const matches =
				normalizedPath === item.href ||
				normalizedPath.startsWith(`${item.href}/`)
			if (!matches) continue
			if (!best || item.href.length > best.length) best = item.href
		}

		return best ?? navItems[0]?.href ?? '/admin/users'
	})()

	return (
		<div className="flex h-dvh bg-background text-foreground font-sans">
			<aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-sidebar md:flex transition-all">
				<div className="h-14 flex items-center gap-2 px-4 border-b border-border bg-secondary/10">
					<div className="h-6 w-6 border border-primary bg-primary text-primary-foreground flex items-center justify-center">
						<Shield className="h-3 w-3" />
					</div>
					<span className="text-sm font-bold uppercase tracking-wider truncate">
						{t('title')}
					</span>
				</div>

				<nav className="flex-1 overflow-y-auto py-6 space-y-1">
					{navItems.map((item) => {
						const isActive = activeHref === item.href
						return (
							<Link
								key={item.href}
								to={item.href}
								aria-current={isActive ? 'page' : undefined}
								className={cn(
									'group flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wide transition-colors duration-200 border-l-2',
									isActive
										? 'bg-secondary border-primary text-foreground'
										: 'border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:border-border',
								)}
							>
								<item.icon
									strokeWidth={1.5}
									className={cn(
										'h-4 w-4',
										isActive
											? 'text-foreground'
											: 'text-muted-foreground group-hover:text-foreground',
									)}
								/>
								<span>{t(`nav.${item.key}`)}</span>
							</Link>
						)
					})}
				</nav>

				<div className="border-t border-border bg-secondary/5">
					<div className="p-4 space-y-4">
						<div className="flex justify-between items-center">
							<ThemeToggle collapsed={false} />
							<LanguageToggle collapsed={false} />
						</div>

						<div className="border border-border p-3 bg-background">
							<div className="space-y-3">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 bg-secondary flex items-center justify-center border border-border">
										<span className="text-xs font-bold font-mono">
											{me?.user?.nickname?.[0]?.toUpperCase() || 'U'}
										</span>
									</div>
									<div className="min-w-0 text-[10px]">
										<p className="font-bold uppercase truncate">
											{me?.user?.nickname || 'ADMIN'}
										</p>
										<p className="font-mono text-muted-foreground truncate">
											{me?.user?.email}
										</p>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<Button
								variant="outline"
								size="sm"
								asChild
								className="w-full rounded-none border-border h-9 uppercase text-[10px] font-bold tracking-widest transition-colors hover:bg-muted"
							>
								<Link to="/media">
									<ArrowLeft className="h-3 w-3 mr-2" />
									{t('actions.backToWorkspace')}
								</Link>
							</Button>

							<Button
								type="button"
								variant="outline"
								size="sm"
								className="w-full rounded-none border-border h-9 uppercase text-[10px] font-bold tracking-widest hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
								onClick={() => logoutMutation.mutate(undefined)}
								disabled={logoutMutation.isPending}
							>
								<LogOut className="h-3 w-3 mr-2" strokeWidth={2} />
								LOGOUT
							</Button>
						</div>
					</div>
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-7xl p-6 md:p-8">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	)
}
