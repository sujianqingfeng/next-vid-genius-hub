import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ConfirmDialogProvider } from '~/components/business/layout/confirm-dialog-provider'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { ThemeProvider, ThemeScript } from '~/integrations/theme'
import WorkspaceShell from '../components/workspace/workspace-shell'
import {
	DEFAULT_LOCALE,
	getInitialI18n,
	getMessages,
	I18nProvider,
} from '../integrations/i18n'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'

interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async () => getInitialI18n(),
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
				title: 'Vid Genius (Start)',
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
	const prefixes = ['/media', '/channels', '/points', '/tasks']
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
					// biome-ignore lint/security/noDangerouslySetInnerHtml: intentional tiny runtime shim
					dangerouslySetInnerHTML={{
						__html:
							'globalThis.__name=globalThis.__name||function(t,n){try{Object.defineProperty(t,\"name\",{value:n,configurable:!0})}catch{}return t};',
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
