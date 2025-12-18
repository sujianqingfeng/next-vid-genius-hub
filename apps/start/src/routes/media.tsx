import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { FolderOpen, Loader2 } from "lucide-react"

import { Button } from "~/components/ui/button"
import { MEDIA_PAGE_SIZE } from "~/lib/pagination"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

const SearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
})

export const Route = createFileRoute("/media")({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({ page: search.page }),
	loader: async ({ context, deps, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = `${location.pathname}${location.search}`
			throw redirect({ to: "/login", search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpcNext.media.list.queryOptions({
				input: { page: deps.page, limit: MEDIA_PAGE_SIZE },
			}),
		)
	},
	component: MediaRoute,
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === "string" || typeof input === "number") {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ""
}

function MediaRoute() {
	const t = useTranslations("Media")
	const { page } = Route.useSearch()

	const listQuery = useQuery(
		queryOrpcNext.media.list.queryOptions({
			input: { page, limit: MEDIA_PAGE_SIZE },
		}),
	)

	const items = listQuery.data?.items ?? []
	const total = listQuery.data?.total ?? 0
	const pageCount = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE))

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-6xl">
					<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
							<p className="text-sm text-muted-foreground">
								{total > 0 ? `${total} items` : "\u00A0"}
							</p>
						</div>
						<Button asChild>
							<Link to="/media/download">{t("downloadCta")}</Link>
						</Button>
					</div>

					{listQuery.isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading…
						</div>
					) : null}

					{listQuery.isError ? (
						<div className="glass rounded-2xl p-6">
							<div className="text-lg font-semibold">{t("error.title")}</div>
							<div className="mt-1 text-sm text-muted-foreground">{t("error.body")}</div>
							<div className="mt-4">
								<Button onClick={() => listQuery.refetch()}>{t("error.retry")}</Button>
							</div>
						</div>
					) : null}

					{!listQuery.isLoading && !listQuery.isError && items.length === 0 ? (
						<div className="glass rounded-2xl p-10 text-center">
							<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
								<FolderOpen className="h-6 w-6 text-foreground" />
							</div>
							<div className="text-lg font-semibold">{t("empty.title")}</div>
							<div className="mt-1 text-sm text-muted-foreground">{t("empty.body")}</div>
							<div className="mt-6">
								<Button asChild>
									<a href="/media/download">{t("downloadCta")}</a>
								</Button>
							</div>
						</div>
					) : null}

					{items.length > 0 ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{items.map((item) => {
								const createdAt = toDateLabel(item.createdAt)
								return (
									<Link
										key={item.id}
										to="/media/$id"
										params={{ id: item.id }}
										className="glass group block overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-0.5"
									>
										<div className="aspect-video w-full bg-secondary/60">
											{item.thumbnail ? (
												<img
													src={item.thumbnail}
													alt={item.title}
													className="h-full w-full object-cover"
													loading="lazy"
												/>
											) : null}
										</div>
										<div className="p-4">
											<div className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:underline">
												{item.translatedTitle || item.title}
											</div>
											<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
												<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
													{item.source}
												</span>
												<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
													{item.quality}
												</span>
												{item.downloadStatus ? (
													<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
														{item.downloadStatus}
													</span>
												) : null}
												{createdAt ? <span className="ml-auto">{createdAt}</span> : null}
											</div>
										</div>
									</Link>
								)
							})}
						</div>
					) : null}

					{pageCount > 1 ? (
						<div className="mt-10 flex items-center justify-center gap-2">
							{page <= 1 ? (
								<Button variant="secondary" disabled>
									Prev
								</Button>
							) : (
								<Button variant="secondary" asChild>
									<Link to="/media" search={{ page: page - 1 }}>
										Prev
									</Link>
								</Button>
							)}
							<div className="px-2 text-sm text-muted-foreground">
								{page} / {pageCount}
							</div>
							{page >= pageCount ? (
								<Button variant="secondary" disabled>
									Next
								</Button>
							) : (
								<Button variant="secondary" asChild>
									<Link to="/media" search={{ page: page + 1 }}>
										Next
									</Link>
								</Button>
							)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}
