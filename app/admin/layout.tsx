'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminAuthGate } from '~/components/auth/admin-auth-gate'
import { cn } from '~/lib/utils'

const navItems = [
	{ label: '用户管理', href: '/admin/users' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname()

	return (
		<AdminAuthGate>
			<div className="min-h-screen bg-gradient-to-b from-background via-secondary/30 to-background text-foreground">
				<header className="sticky top-0 z-20 border-b border-border/50 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/80">
					<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
						<div className="text-lg font-semibold tracking-tight">Admin Console</div>
						<nav className="flex items-center gap-2 text-sm">
							{navItems.map((item) => {
								const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											'rounded-full px-3 py-1.5 transition-colors',
											isActive
												? 'bg-primary/10 text-primary ring-1 ring-primary/30'
												: 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
										)}
									>
										{item.label}
									</Link>
								)
							})}
						</nav>
					</div>
				</header>
				<main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
			</div>
		</AdminAuthGate>
	)
}
