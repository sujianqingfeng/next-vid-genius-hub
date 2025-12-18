import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, RefreshCw } from "lucide-react"

import { Button } from "~/components/ui/button"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

export const Route = createFileRoute("/media/$id")({
	loader: async ({ context, params, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = `${location.pathname}${location.search}`
			throw redirect({ to: "/login", search: { next } })
		}

		const item = await context.queryClient.ensureQueryData(
			queryOrpcNext.media.byId.queryOptions({ input: { id: params.id } }),
		)

		if (!item) throw notFound()
	},
	component: MediaDetailRoute,
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === "string" || typeof input === "number") {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ""
}

function MediaDetailRoute() {
	const t = useTranslations("MediaDetail")
	const qc = useQueryClient()

	const { id } = Route.useParams()

	const mediaQuery = useQuery(
		queryOrpcNext.media.byId.queryOptions({ input: { id } }),
	)

	const refreshMutation = useEnhancedMutation(
		queryOrpcNext.media.refreshMetadata.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }) })
				await qc.invalidateQueries({ queryKey: queryOrpcNext.media.list.key() })
			},
		}),
		{
			successToast: t("actions.syncSuccess"),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t("error"),
		},
	)

	if (mediaQuery.isLoading) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl text-sm text-muted-foreground">
					<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
					{t("loading")}
				</div>
			</div>
		)
	}

	if (mediaQuery.isError || !mediaQuery.data) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="glass rounded-2xl p-6">
						<div className="text-sm text-muted-foreground">{t("error")}</div>
						<div className="mt-4 flex gap-2">
							<Button variant="secondary" asChild>
								<Link to="/media">{t("back")}</Link>
							</Button>
							<Button onClick={() => mediaQuery.refetch()}>Retry</Button>
						</div>
					</div>
				</div>
			</div>
		)
	}

	const item = mediaQuery.data
	const createdAt = toDateLabel(item.createdAt)

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl space-y-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
							<h1 className="text-3xl font-semibold tracking-tight">
								{item.translatedTitle || item.title}
							</h1>
							{item.url ? (
								<a
									href={item.url}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
								>
									<ExternalLink className="h-4 w-4" />
									{item.url}
								</a>
							) : null}
						</div>

						<div className="flex flex-wrap gap-2">
							<Button variant="secondary" asChild>
								<Link to="/media">{t("back")}</Link>
							</Button>
							<Button
								variant="secondary"
								disabled={refreshMutation.isPending}
								onClick={() => refreshMutation.mutate({ id })}
							>
								{refreshMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{t("actions.syncing")}
									</>
								) : (
									<>
										<RefreshCw className="mr-2 h-4 w-4" />
										{t("actions.sync")}
									</>
								)}
							</Button>
							<Button variant="ghost" asChild>
								<a href={`/media/${id}`}>
									Legacy
									<ExternalLink className="ml-2 h-4 w-4" />
								</a>
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
						<div className="glass overflow-hidden rounded-2xl">
							<div className="aspect-video w-full bg-secondary/60">
								{item.thumbnail ? (
									<img
										src={item.thumbnail}
										alt={t("video.thumbnailAlt")}
										className="h-full w-full object-cover"
									/>
								) : null}
							</div>
							<div className="p-5">
								<div className="text-sm text-muted-foreground">
									{item.author ? <div>Author: {item.author}</div> : null}
									{typeof item.duration === "number" ? (
										<div>Duration: {item.duration}s</div>
									) : null}
									<div className="mt-2 flex flex-wrap gap-3">
										<div>Views: {item.viewCount ?? 0}</div>
										<div>Likes: {item.likeCount ?? 0}</div>
										<div>Comments: {item.commentCount ?? 0}</div>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="glass rounded-2xl p-5">
								<div className="text-sm font-semibold">{t("actions.title")}</div>
								<div className="mt-3 flex flex-col gap-2">
									<Button variant="secondary" className="w-full justify-start" asChild>
										<Link to="/media/$id/subtitles" params={{ id }}>
											{t("tabs.subtitlesAction")}
										</Link>
									</Button>
									<Button variant="secondary" className="w-full justify-start" asChild>
										<a href={`/media/${id}/comments`}>{t("tabs.commentsAction")}</a>
									</Button>
								</div>
								<div className="mt-3 text-xs text-muted-foreground">
									Links above open the legacy Next pages (not migrated yet).
								</div>
							</div>

							{item.transcription ? (
								<div className="glass rounded-2xl p-5">
									<div className="text-sm font-semibold">Transcription</div>
									<p className="mt-2 line-clamp-6 text-sm text-muted-foreground">
										{item.transcription}
									</p>
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
