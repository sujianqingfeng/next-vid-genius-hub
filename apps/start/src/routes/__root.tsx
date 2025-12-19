import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
	useRouterState,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import Header from "../components/Header"
import WorkspaceShell from "../components/workspace/workspace-shell"
import {
	DEFAULT_LOCALE,
	getInitialI18n,
	getMessages,
	I18nProvider,
} from "../integrations/i18n"
import { Toaster } from "sonner"

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools"

import appCss from "../styles.css?url"

import type { QueryClient } from "@tanstack/react-query"

interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async () => getInitialI18n(),
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Vid Genius (Start)",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootLayout,
	shellComponent: RootDocument,
})

function isWorkspacePath(pathname: string): boolean {
	const baseUrl =
		import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "/"
			? import.meta.env.BASE_URL.replace(/\/$/, "")
			: ""

	const raw =
		baseUrl && pathname.startsWith(baseUrl) ? pathname.slice(baseUrl.length) : pathname
	const normalized = raw.endsWith("/") && raw !== "/" ? raw.slice(0, -1) : raw
	const prefixes = ["/media", "/channels", "/proxy", "/points", "/tasks"]
	return prefixes.some(
		(prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
	)
}

function isAdminPath(pathname: string): boolean {
	const baseUrl =
		import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "/"
			? import.meta.env.BASE_URL.replace(/\/$/, "")
			: ""

	const raw =
		baseUrl && pathname.startsWith(baseUrl) ? pathname.slice(baseUrl.length) : pathname
	const normalized = raw.endsWith("/") && raw !== "/" ? raw.slice(0, -1) : raw
	return normalized === "/admin" || normalized.startsWith("/admin/")
}

function RootLayout() {
	const data = Route.useLoaderData()
	const locale = data?.locale ?? DEFAULT_LOCALE
	const messages = data?.messages ?? getMessages(locale)
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const isWorkspace = isWorkspacePath(pathname)
	const isAdmin = isAdminPath(pathname)
	const hideHeader =
		isWorkspace || isAdmin || pathname === "/login" || pathname.endsWith("/login")

	const content = isWorkspace ? (
		<WorkspaceShell>
			<Outlet />
		</WorkspaceShell>
	) : (
		<Outlet />
	)

	return (
		<I18nProvider locale={locale} messages={messages}>
			{!hideHeader ? <Header /> : null}
			{content}
			<Toaster richColors />
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
					TanStackQueryDevtools,
				]}
			/>
		</I18nProvider>
	)
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	)
}
