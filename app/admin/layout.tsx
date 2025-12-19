'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AdminAuthGate } from '~/components/auth/admin-auth-gate'
import { cn } from '~/lib/utils'
import { useTranslations } from '~/lib/i18n'
import { ArrowLeft, Shield } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'

const navItems = [
	{ key: 'users', href: '/admin/users' },
	{ key: 'aiProviders', href: '/admin/ai-providers' },
	{ key: 'aiModels', href: '/admin/ai-models' },
	{ key: 'pricing', href: '/admin/points-pricing' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	const t = useTranslations('Admin.layout')
	const pathname = usePathname()
	const router = useRouter()

	const activeHref = (() => {
		let best: string | null = null
		for (const item of navItems) {
			const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
			if (!matches) continue
			if (!best || item.href.length > best.length) best = item.href
		}
		return best ?? navItems[0]?.href ?? '/admin/users'
	})()

	return (
		<AdminAuthGate>
			<div className="flex h-dvh bg-gradient-to-br from-background to-secondary/50 text-foreground">
				<aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border/50 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex">
					<div className="flex h-16 items-center gap-3 px-5">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
							<Shield className="h-5 w-5 text-primary" strokeWidth={1.5} />
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold tracking-tight">
								{t('title')}
							</div>
						</div>
					</div>

					<nav className="space-y-1 px-3 py-3">
						{navItems.map((item) => {
							const isActive = activeHref === item.href
							return (
								<Link
									key={item.href}
									href={item.href}
									aria-current={isActive ? 'page' : undefined}
									className={cn(
										'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
										isActive
											? 'bg-primary/10 text-primary ring-1 ring-primary/20'
											: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
									)}
								>
									<span>{t(`nav.${item.key}`)}</span>
								</Link>
							)
						})}
					</nav>

					<div className="mt-auto p-4">
						<Button variant="outline" size="sm" asChild className="w-full justify-start gap-2">
							<Link href="/media">
								<ArrowLeft className="h-4 w-4" />
								{t('actions.backToWorkspace')}
							</Link>
						</Button>
					</div>
				</aside>

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
						<div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
							<div className="flex items-center gap-3">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 md:hidden">
									<Shield className="h-4 w-4 text-primary" strokeWidth={1.5} />
								</div>
								<div className="text-sm font-semibold tracking-tight md:hidden">
									{t('title')}
								</div>
							</div>

							<div className="flex items-center gap-2 md:hidden">
								<Select value={activeHref} onValueChange={(v) => router.push(v)}>
									<SelectTrigger className="h-9 w-[190px]">
										<SelectValue placeholder={t('mobile.sectionPlaceholder')} />
									</SelectTrigger>
									<SelectContent>
										{navItems.map((item) => (
											<SelectItem key={item.href} value={item.href}>
												{t(`nav.${item.key}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button variant="outline" size="sm" asChild className="gap-2">
									<Link href="/media">
										<ArrowLeft className="h-4 w-4" />
										{t('actions.back')}
									</Link>
								</Button>
							</div>

							<div className="hidden md:block" />
						</div>
					</header>

					<main className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
						<div className="mx-auto w-full max-w-6xl">{children}</div>
					</main>
				</div>
			</div>
		</AdminAuthGate>
	)
}
