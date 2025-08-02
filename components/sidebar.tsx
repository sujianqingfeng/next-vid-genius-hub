'use client'

import {
	ChevronLeft,
	ChevronRight,
	Download,
	Settings,
	Video,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultCollapsed?: boolean
}

const menuItems = [
	{
		title: 'Downloads',
		href: '/downloads',
		icon: Download,
	},
	{
		title: 'Videos',
		href: '/videos',
		icon: Video,
	},
	{
		title: 'Settings',
		href: '/settings',
		icon: Settings,
	},
]

export function Sidebar({ className, defaultCollapsed = false }: SidebarProps) {
	const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
	const pathname = usePathname()

	return (
		<div
			className={cn(
				'relative bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out',
				collapsed ? 'w-16' : 'w-64',
				className,
			)}
		>
			<div className="flex h-full flex-col">
				{/* Header */}
				<div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
					{!collapsed && (
						<span className="text-lg font-semibold">Video Genius</span>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onClick={() => setCollapsed(!collapsed)}
					>
						{collapsed ? (
							<ChevronRight className="h-4 w-4" />
						) : (
							<ChevronLeft className="h-4 w-4" />
						)}
					</Button>
				</div>

				{/* Navigation */}
				<nav className="flex-1 space-y-2 p-4">
					{menuItems.map((item) => {
						const isActive = pathname === item.href
						return (
							<Link
								key={item.href}
								href={item.href}
								className={cn(
									'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
									isActive
										? 'bg-sidebar-primary text-sidebar-primary-foreground'
										: 'text-sidebar-foreground',
									collapsed && 'justify-center',
								)}
							>
								<item.icon className="h-5 w-5 flex-shrink-0" />
								{!collapsed && <span>{item.title}</span>}
							</Link>
						)
					})}
				</nav>

				{/* Footer */}
				<div className="border-t border-sidebar-border p-4">
					<div
						className={cn(
							'flex items-center gap-3',
							collapsed && 'justify-center',
						)}
					>
						<div className="h-8 w-8 rounded-full bg-sidebar-primary" />
						{!collapsed && (
							<div className="text-sm">
								<p className="font-medium">User</p>
								<p className="text-xs text-sidebar-foreground/70">
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
