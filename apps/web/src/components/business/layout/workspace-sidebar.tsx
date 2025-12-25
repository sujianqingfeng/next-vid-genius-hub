import { Link, useRouterState } from '@tanstack/react-router'
import {
	ChevronLeft,
	ChevronRight,
	Coins,
	FileVideo,
	ListChecks,
	ListVideo,
	LogOut,
	Shield,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

import { useAuthQuery, useLogoutMutation } from '~/lib/auth/hooks'
import { useTranslations } from '~/lib/i18n'

import LanguageToggle from './language-toggle'
import ThemeToggle from './theme-toggle'

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
				'group flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wide transition-colors duration-200 border-l-2',
				isActive
					? 'bg-secondary border-primary text-foreground font-bold'
					: 'border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:border-border',
				collapsed && 'justify-center px-2',
			)}
			aria-current={isActive ? 'page' : undefined}
			aria-label={item.title}
		>
			<item.icon
				strokeWidth={1.5}
				className={cn(
					'h-4 w-4 flex-shrink-0',
					isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
				)}
			/>
			{!collapsed ? <span className="block truncate">{item.title}</span> : null}
		</Link>
	)

	return (
		<div
			className={cn(
				'relative bg-sidebar border-r border-border flex flex-col',
				'transition-all duration-300 ease-in-out',
				collapsed ? 'w-16' : 'w-64',
			)}
		>
			{/* Brand Header */}
			<div className="h-14 flex items-center justify-between px-4 border-b border-border bg-secondary/10">
				{!collapsed ? (
					<div className="flex items-center gap-2 overflow-hidden">
						<div className="h-6 w-6 border border-foreground bg-foreground text-background flex items-center justify-center">
							<FileVideo className="h-3 w-3" />
						</div>
						<span className="text-sm font-bold uppercase tracking-wider truncate">
							{t('brand')}
						</span>
					</div>
				) : (
					<div className="mx-auto">
						<div className="h-6 w-6 border border-foreground bg-foreground text-background flex items-center justify-center">
							<FileVideo className="h-3 w-3" />
						</div>
					</div>
				)}
			</div>

			{/* Toggle Button (Absolute) */}
			<button
				type="button"
				className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
				onClick={() => setCollapsed((v) => !v)}
				aria-label={collapsed ? t('toggle.expand') : t('toggle.collapse')}
			>
				{collapsed ? (
					<ChevronRight className="h-3 w-3" />
				) : (
					<ChevronLeft className="h-3 w-3" />
				)}
			</button>

			{/* Navigation */}
			<nav className="flex-1 overflow-y-auto py-6 space-y-1">
				{menuItems.map((item) =>
					renderMenuItem(item, normalizePathname(item.to) === activeHref),
				)}
				
				{bottomMenuItems.length > 0 && (
					<>
						<div className="my-4 border-t border-border mx-4" />
						{bottomMenuItems.map((item) =>
							renderMenuItem(item, normalizePathname(item.to) === activeHref),
						)}
					</>
				)}
			</nav>

			{/* Footer / User Profile */}
			<div className="border-t border-border bg-secondary/5">
				<div className="p-4 space-y-4">
					<div className={cn(
						"flex",
						collapsed ? "flex-col gap-2 items-center" : "justify-between items-center"
					)}>
						<ThemeToggle collapsed={collapsed} />
						<LanguageToggle collapsed={collapsed} />
					</div>

					<div className={cn(
						"border border-border p-3 bg-background",
						collapsed && "p-2 flex justify-center border-none bg-transparent"
					)}>
						{!collapsed ? (
							<div className="space-y-3">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 bg-secondary flex items-center justify-center border border-border">
										<span className="text-xs font-bold font-mono">
											{me?.user?.nickname?.[0]?.toUpperCase() || 'U'}
										</span>
									</div>
									<div className="min-w-0">
										<p className="text-xs font-bold uppercase truncate">
											{me?.user?.nickname || 'Guest'}
										</p>
										<p className="text-[10px] font-mono text-muted-foreground truncate">
											{me?.user?.email}
										</p>
									</div>
								</div>
								
								{typeof me?.balance === 'number' && (
									<div className="flex items-center justify-between border-t border-border pt-2">
										<span className="text-[10px] uppercase text-muted-foreground">Credits</span>
										<span className="text-xs font-mono font-bold">{me.balance}</span>
									</div>
								)}
							</div>
						) : (
							<div className="h-8 w-8 bg-secondary flex items-center justify-center border border-border" title={me?.user?.email}>
								<span className="text-xs font-bold font-mono">
									{me?.user?.nickname?.[0]?.toUpperCase() || 'U'}
								</span>
							</div>
						)}
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						className={cn(
							'w-full rounded-none border-border h-9 uppercase text-xs hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors',
							collapsed && 'px-0 border-transparent hover:border-transparent bg-transparent'
						)}
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