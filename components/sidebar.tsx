'use client'

import {
	ChevronLeft,
	ChevronRight,
	Download,
	FileVideo,
	ListVideo,
	Globe,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultCollapsed?: boolean
}

const menuItems = [
	{
		title: 'Media Library',
		href: '/media',
		icon: FileVideo,
		description: 'Manage your videos',
	},
	{
		title: 'Channels',
		href: '/channels',
		icon: ListVideo,
		description: 'Track YouTube channels',
	},
	{
		title: 'Downloads',
		href: '/media/download',
		icon: Download,
		description: 'Download new content',
	},
	{
		title: 'Proxy Manager',
		href: '/proxy',
		icon: Globe,
		description: 'Manage proxy servers',
	},
]

type MenuItem = (typeof menuItems)[number]

const bottomMenuItems: MenuItem[] = []

export function Sidebar({ className, defaultCollapsed = false }: SidebarProps) {
	const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
	const pathname = usePathname()

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
	}, [pathname])

	const renderMenuItem = (item: MenuItem, isActive: boolean) => (
		<Link
			key={item.href}
			href={item.href}
			className={cn(
				'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
				'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
				isActive
					? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
					: 'text-sidebar-foreground',
				collapsed && 'justify-center',
			)}
			aria-current={isActive ? 'page' : undefined}
			aria-label={item.title}
		>
			<item.icon
				className={cn(
					'h-5 w-5 flex-shrink-0 transition-transform duration-200',
					isActive && 'scale-110',
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
					<TooltipContent side="right" className="max-w-xs">
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
				'relative bg-sidebar text-sidebar-foreground border-r border-sidebar-border',
				'transition-all duration-300 ease-in-out',
				collapsed ? 'w-16' : 'w-64',
				className,
			)}
		>
			<div className="flex h-full flex-col">
				{/* Header */}
				<div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
					{!collapsed && (
						<div className="flex items-center gap-2">
							<div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
								<FileVideo className="h-4 w-4 text-sidebar-primary-foreground" />
							</div>
							<span className="text-lg font-bold">Video Genius</span>
						</div>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
								onClick={() => setCollapsed(!collapsed)}
							>
								{collapsed ? (
									<ChevronRight className="h-4 w-4" />
								) : (
									<ChevronLeft className="h-4 w-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
						</TooltipContent>
					</Tooltip>
				</div>

				{/* Navigation */}
				<nav className="flex-1 space-y-1 p-3">
					{renderMenuSection(menuItems)}
				</nav>

				{/* Bottom Navigation */}
				{bottomMenuItems.length > 0 && (
					<nav className="space-y-1 p-3 border-t border-sidebar-border">
						{renderMenuSection(bottomMenuItems)}
					</nav>
				)}

				{/* Footer */}
				<div className="border-t border-sidebar-border p-3">
					<div
						className={cn(
							'flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sidebar-accent',
							collapsed && 'justify-center',
						)}
					>
						<div className="h-8 w-8 rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-primary/80 flex items-center justify-center">
							<span className="text-xs font-semibold text-sidebar-primary-foreground">
								U
							</span>
						</div>
						{!collapsed && (
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">User</p>
								<p className="text-xs text-sidebar-foreground/70 truncate">
									user@example.com
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
