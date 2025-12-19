'use client'

import {
	ChevronLeft,
	ChevronRight,
	FileVideo,
	ListVideo,
	Globe,
	ListChecks,
	Coins,
	LogOut,
	Shield,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { useTranslations } from '~/lib/i18n'
import { LanguageSwitcher } from '~/components/business/layout/language-switcher'
import { Button } from '~/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { useAuthQuery, useLogoutMutation } from '~/lib/auth/hooks'
import { Badge } from '~/components/ui/badge'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultCollapsed?: boolean
}

const baseMenuItems = [
	{
		key: 'media',
		href: '/media',
		icon: FileVideo,
	},
	{
		key: 'channels',
		href: '/channels',
		icon: ListVideo,
	},
	{
		key: 'proxy',
		href: '/proxy',
		icon: Globe,
	},
	{
		key: 'points',
		href: '/points',
		icon: Coins,
	},
	{
		key: 'tasks',
		href: '/tasks',
		icon: ListChecks,
	},
] as const

type MenuItem = {
	key: string
	href: string
	icon: (typeof baseMenuItems)[number]['icon']
	title: string
	description: string
}
type MenuKey = (typeof baseMenuItems)[number]['key'] | 'admin'

export function Sidebar({ className, defaultCollapsed = false }: SidebarProps) {
	const t = useTranslations('Sidebar')
	const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
	const pathname = usePathname()
	const { data: me } = useAuthQuery()
	const logoutMutation = useLogoutMutation()

	const menuItems: MenuItem[] = React.useMemo(
		() =>
			baseMenuItems.map((item) => ({
				...item,
				title: t(`nav.${item.key}.title`),
				description: t(`nav.${item.key}.desc`),
			})),
		[t],
	)

	const bottomMenuItems: MenuItem[] =
		me?.user?.role === 'admin'
			? [
					{
						key: 'admin' as MenuKey,
						href: '/admin/users',
						icon: Shield,
						title: t('nav.admin.title'),
						description: t('nav.admin.desc'),
					},
				]
			: []

	// Longest-prefix match to avoid multiple active items (e.g., /media vs /media/download)
	const activeHref = React.useMemo(() => {
		const allItems = [...menuItems, ...bottomMenuItems]
		let best: string | null = null
		for (const item of allItems) {
			const href = item.href
			const matches = pathname === href || pathname.startsWith(`${href}/`)
			if (matches) {
				if (!best || href.length > best.length) best = href
			}
		}
		return best
	}, [pathname, menuItems, bottomMenuItems])

	const renderMenuItem = (item: MenuItem, isActive: boolean) => (
		<Link
			key={item.href}
			href={item.href}
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
			{!collapsed && (
				<div className="flex-1 min-w-0">
					<span className="block truncate">{item.title}</span>
				</div>
			)}
		</Link>
	)

	const renderMenuSection = (items: MenuItem[]) =>
		items.map((item) => {
			const isActive = item.href === activeHref
			return collapsed ? (
				<Tooltip key={item.href}>
					<TooltipTrigger asChild>
						{renderMenuItem(item, isActive)}
					</TooltipTrigger>
					<TooltipContent side="right" className="glass border-none shadow-lg">
						<div>
							<p className="font-medium">{item.title}</p>
							<p className="text-xs text-muted-foreground">
								{item.description}
							</p>
						</div>
					</TooltipContent>
				</Tooltip>
			) : (
				renderMenuItem(item, isActive)
			)
		})

	return (
		<div
			className={cn(
				'relative glass border-r border-sidebar-border/50',
				'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
				collapsed ? 'w-20' : 'w-72',
				className,
			)}
		>
			<div className="flex h-full flex-col">
				{/* Header */}
				<div className="flex h-20 items-center justify-between px-6">
					{!collapsed && (
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
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors rounded-full"
								onClick={() => setCollapsed(!collapsed)}
							>
								{collapsed ? (
									<ChevronRight strokeWidth={1.5} className="h-4 w-4" />
								) : (
									<ChevronLeft strokeWidth={1.5} className="h-4 w-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right" className="glass">
							{collapsed ? t('toggle.expand') : t('toggle.collapse')}
						</TooltipContent>
					</Tooltip>
				</div>

				{/* Navigation */}
				<nav className="flex-1 space-y-2 px-4 py-4">
					{renderMenuSection(menuItems)}
				</nav>

				{/* Bottom Navigation */}
				{bottomMenuItems.length > 0 && (
					<nav className="space-y-2 px-4 py-4 border-t border-sidebar-border/30">
						{renderMenuSection(bottomMenuItems)}
					</nav>
				)}

				{/* Footer */}
				<div className="p-4 space-y-3">
					<LanguageSwitcher collapsed={collapsed} />
					<div
						className={cn(
							'flex items-center gap-3 rounded-xl p-3 transition-all duration-300 hover:bg-sidebar-accent/40',
							collapsed && 'justify-center',
						)}
					>
						<div className="h-9 w-9 rounded-full bg-gradient-to-br from-sidebar-primary/10 to-sidebar-primary/5 ring-1 ring-sidebar-primary/20 flex items-center justify-center group-hover:ring-sidebar-primary/40 transition-all">
							<span className="text-xs font-semibold text-sidebar-primary">
								{me?.user?.nickname?.[0]?.toUpperCase() ||
									me?.user?.email?.[0]?.toUpperCase() ||
									'U'}
							</span>
						</div>
						{!collapsed && (
							<div className="flex-1 min-w-0 space-y-1 animate-in fade-in duration-300">
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium truncate text-sidebar-foreground/90">
										{me?.user?.nickname || me?.user?.email || t('user.guest')}
									</p>
									{typeof me?.balance === 'number' && (
										<Badge variant="secondary" className="text-[11px]">
											{me.balance} {t('user.pointsSuffix')}
										</Badge>
									)}
								</div>
								<p className="text-xs text-sidebar-foreground/50 truncate">
									{me?.user?.email || t('user.loginPrompt')}
								</p>
									<Button
										variant="outline"
										size="sm"
										className="h-8 px-2 text-xs"
										onClick={() => logoutMutation.mutate(undefined)}
										disabled={logoutMutation.isPending}
									>
									<LogOut className="h-3.5 w-3.5 mr-1" />
									{t('user.logout')}
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
