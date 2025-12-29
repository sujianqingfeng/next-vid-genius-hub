import { useEffect } from 'react'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ConfirmDialogProvider } from '~/components/business/layout/confirm-dialog-provider'
import WorkspaceShell from '~/components/business/layout/workspace-shell'
import { Button } from '~/components/ui/button'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { useTranslations } from '~/lib/i18n'
import { ThemeProvider, ThemeScript } from '~/lib/theme'
import {
	DEFAULT_LOCALE,
	getInitialI18n,
	getMessages,
	I18nProvider,
} from '~/lib/i18n/start'
import TanStackQueryDevtools from '~/lib/query/devtools'
import appCss from '~/styles.css?url'

interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async (_ctx) => getInitialI18n(),
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Video Genius Hub',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
		],
	}),

	component: RootLayout,
	shellComponent: RootDocument,
	notFoundComponent: NotFoundPage,
})

function isWorkspacePath(pathname: string): boolean {
	const baseUrl =
		import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
			? import.meta.env.BASE_URL.replace(/\/$/, '')
			: ''

	const raw =
		baseUrl && pathname.startsWith(baseUrl)
			? pathname.slice(baseUrl.length)
			: pathname
	const normalized = raw.endsWith('/') && raw !== '/' ? raw.slice(0, -1) : raw
	const prefixes = [
		'/media',
		'/channels',
		'/points',
		'/tasks',
		'/threads',
		'/agent',
	]
	return prefixes.some(
		(prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
	)
}

function RootLayout() {
	const data = Route.useLoaderData()
	const locale = data?.locale ?? DEFAULT_LOCALE
	const messages = data?.messages ?? getMessages(locale)
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const isWorkspace = isWorkspacePath(pathname)

	const content = isWorkspace ? (
		<WorkspaceShell>
			<Outlet />
		</WorkspaceShell>
	) : (
		<Outlet />
	)

	return (
		<ThemeProvider defaultTheme="system" enableSystem disableTransitionOnChange>
			<I18nProvider locale={locale} messages={messages}>
				<I18nDocumentTitle />
				<TooltipProvider delayDuration={300}>
					<ConfirmDialogProvider>
						{content}
						<Toaster richColors position="top-right" />
						<TanStackDevtools
							config={{
								position: 'bottom-right',
							}}
							plugins={[
								{
									name: 'Tanstack Router',
									render: <TanStackRouterDevtoolsPanel />,
								},
								TanStackQueryDevtools,
							]}
						/>
					</ConfirmDialogProvider>
				</TooltipProvider>
			</I18nProvider>
		</ThemeProvider>
	)
}

function I18nDocumentTitle() {
	const t = useTranslations('Layout')

	useEffect(() => {
		document.title = t('title')
	}, [t])

	return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const data = Route.useLoaderData()
	const locale = data?.locale ?? DEFAULT_LOCALE
	return (
		<html lang={locale} suppressHydrationWarning>
			<head>
				<ThemeScript />
				<HeadContent />
				{/* Vite/esbuild may emit `__name(...)` helpers inside TanStack Start's inline
				SSR payload scripts. Those scripts execute in classic script context (not
				module scope), so provide a tiny global shim to prevent a hard crash that
				results in a blank page. */}
				<script
					// oxlint-disable-next-line react/no-danger: intentional tiny runtime shim
					dangerouslySetInnerHTML={{
						__html:
							'globalThis.__name=globalThis.__name||function(t,n){try{Object.defineProperty(t,"name",{value:n,configurable:!0})}catch{}return t};',
					}}
				/>
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	)
}

function NotFoundPage() {
	const t = useTranslations('NotFound')
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-xl">
					<div className="glass rounded-2xl p-10 text-center">
						<div className="text-sm font-medium text-muted-foreground">404</div>
						<h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
							{t('title')}
						</h1>
						<p className="mt-2 text-sm text-muted-foreground">{t('body')}</p>
						<p className="mt-4 break-all text-xs text-muted-foreground">
							{pathname}
						</p>
						<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
							<Button asChild>
								<Link to="/">{t('home')}</Link>
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={() => window.history.back()}
							>
								{t('back')}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
