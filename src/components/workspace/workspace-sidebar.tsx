import { Link, useRouterState } from '@tanstack/react-router'
import {
	ChevronLeft,
	ChevronRight,
	Coins,
	FileVideo,
	Globe,
	ListChecks,
	ListVideo,
	LogOut,
	Shield,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

import { useAuthQuery, useLogoutMutation } from '../../integrations/auth/hooks'
import { useTranslations } from '../../integrations/i18n'
import LanguageToggle from '../LanguageToggle'

type MenuItem = {
	key: string
	to: string
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
	title: string
	description: string
}

const baseMenuItems = [
	{
		key: 'media',
		to: '/media',
		icon: FileVideo,
	},
	{
		key: 'channels',
		to: '/channels',
		icon: ListVideo,
	},
	{
		key: 'proxy',
		to: '/proxy',
		icon: Globe,
	},
	{
		key: 'points',
		to: '/points',
		icon: Coins,
	},
	{
		key: 'tasks',
		to: '/tasks',
		icon: ListChecks,
	},
] as const

function normalizePathname(input: string): string {
	if (input === '/') return '/'
	return input.endsWith('/') ? input.slice(0, -1) : input
}

function stripBasePath(pathname: string): string {
	const baseUrl =
		import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
			? import.meta.env.BASE_URL.replace(/\/$/, '')
			: ''
	return baseUrl && pathname.startsWith(baseUrl)
		? pathname.slice(baseUrl.length)
		: pathname
}

function longestPrefixMatch(
	pathname: string,
	items: MenuItem[],
): string | null {
	const normalized = normalizePathname(pathname)
	let best: string | null = null

	for (const item of items) {
		const href = normalizePathname(item.to)
		const matches = normalized === href || normalized.startsWith(`${href}/`)
		if (!matches) continue
		if (!best || href.length > best.length) best = href
	}

	return best
}

export default function WorkspaceSidebar({
	defaultCollapsed = false,
}: {
	defaultCollapsed?: boolean
}) {
	const t = useTranslations('Sidebar')
	const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
	const location = useRouterState({ select: (s) => s.location })
	const pathname = stripBasePath(location.pathname)

	const { data: me } = useAuthQuery()
	const logoutMutation = useLogoutMutation({
		redirectTo: '/login',
		redirectSearch: { next: `${pathname}${location.search}` },
	})

	const menuItems = React.useMemo<MenuItem[]>(
		() =>
			baseMenuItems.map((item) => ({
				...item,
				title: t(`nav.${item.key}.title`),
				description: t(`nav.${item.key}.desc`),
			})),
		[t],
	)

	const bottomMenuItems = React.useMemo<MenuItem[]>(
		() =>
			me?.user?.role === 'admin'
				? [
						{
							key: 'admin',
							to: '/admin/users',
							icon: Shield,
							title: t('nav.admin.title'),
							description: t('nav.admin.desc'),
						},
					]
				: [],
		[me?.user?.role, t],
	)

	const activeHref = React.useMemo(
		() => longestPrefixMatch(pathname, [...menuItems, ...bottomMenuItems]),
		[pathname, menuItems, bottomMenuItems],
	)

	const renderMenuItem = (item: MenuItem, isActive: boolean) => (
		<Link
			key={item.to}
			to={item.to}
			className={cn(
				'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300',
				'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground hover:backdrop-blur-sm',
				isActive
					? 'bg-sidebar-primary/10 text-sidebar-primary shadow-none ring-1 ring-sidebar-primary/20'
					: 'text-sidebar-foreground/80 hover:text-sidebar-foreground',
				collapsed && 'justify-center',
			)}
			aria-current={isActive ? 'page' : undefined}
			aria-label={item.title}
		>
			<item.icon
				strokeWidth={1.5}
				className={cn(
					'h-5 w-5 flex-shrink-0 transition-transform duration-300',
					isActive && 'scale-105',
				)}
			/>
			{!collapsed ? <span className="block truncate">{item.title}</span> : null}
		</Link>
	)

	return (
		<div
			className={cn(
				'relative glass border-r border-sidebar-border/50',
				'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
				collapsed ? 'w-20' : 'w-72',
			)}
		>
			<div className="flex h-full flex-col">
				<div className="flex h-20 items-center justify-between px-6">
					{!collapsed ? (
						<div className="flex items-center gap-3 animate-in fade-in duration-500">
							<div className="h-9 w-9 rounded-xl bg-sidebar-primary/10 flex items-center justify-center ring-1 ring-sidebar-primary/20">
								<FileVideo
									strokeWidth={1.5}
									className="h-5 w-5 text-sidebar-primary"
								/>
							</div>
							<span className="text-lg font-semibold tracking-tight">
								{t('brand')}
							</span>
						</div>
					) : (
						<div />
					)}

					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors rounded-full"
						onClick={() => setCollapsed((v) => !v)}
						aria-label={collapsed ? t('toggle.expand') : t('toggle.collapse')}
					>
						{collapsed ? (
							<ChevronRight strokeWidth={1.5} className="h-4 w-4" />
						) : (
							<ChevronLeft strokeWidth={1.5} className="h-4 w-4" />
						)}
					</Button>
				</div>

				<nav className="flex-1 space-y-2 px-4 py-4">
					{menuItems.map((item) =>
						renderMenuItem(item, normalizePathname(item.to) === activeHref),
					)}
				</nav>

				{bottomMenuItems.length > 0 ? (
					<nav className="space-y-2 px-4 py-4 border-t border-sidebar-border/30">
						{bottomMenuItems.map((item) =>
							renderMenuItem(item, normalizePathname(item.to) === activeHref),
						)}
					</nav>
				) : null}

				<div className="p-4 space-y-3">
					<div
						className={collapsed ? 'flex justify-center' : 'flex justify-end'}
					>
						<LanguageToggle />
					</div>

					<div
						className={cn(
							'flex items-center gap-3 rounded-xl p-3 transition-all duration-300 hover:bg-sidebar-accent/40',
							collapsed && 'justify-center',
						)}
					>
						<div className="h-9 w-9 rounded-full bg-gradient-to-br from-sidebar-primary/10 to-sidebar-primary/5 ring-1 ring-sidebar-primary/20 flex items-center justify-center">
							<span className="text-xs font-semibold text-sidebar-primary">
								{me?.user?.nickname?.[0]?.toUpperCase() ||
									me?.user?.email?.[0]?.toUpperCase() ||
									'U'}
							</span>
						</div>

						{!collapsed ? (
							<div className="flex-1 min-w-0 space-y-1 animate-in fade-in duration-300">
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium truncate text-sidebar-foreground/90">
										{me?.user?.nickname || me?.user?.email || t('user.guest')}
									</p>
									{typeof me?.balance === 'number' ? (
										<Badge variant="secondary" className="text-[11px]">
											{me.balance} {t('user.pointsSuffix')}
										</Badge>
									) : null}
								</div>
								<p className="text-xs text-sidebar-foreground/50 truncate">
									{me?.user?.email || t('user.loginPrompt')}
								</p>
							</div>
						) : null}
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						className={cn('h-9 w-full', collapsed && 'px-0')}
						onClick={() => logoutMutation.mutate(undefined)}
						disabled={logoutMutation.isPending}
					>
						<LogOut
							className={cn('h-4 w-4', collapsed ? '' : 'mr-2')}
							strokeWidth={1.5}
						/>
						{!collapsed ? t('user.logout') : null}
					</Button>
				</div>
			</div>
		</div>
	)
}
