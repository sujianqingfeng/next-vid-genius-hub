import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Button } from "~/components/ui/button"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

const RECENT_LIMIT = 50

export const Route = createFileRoute("/tasks")({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = `${location.pathname}${location.search}`
			throw redirect({ to: "/login", search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpcNext.task.listRecent.queryOptions({
				input: { limit: RECENT_LIMIT, offset: 0 },
			}),
		)
	},
	component: TasksRoute,
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === "string" || typeof input === "number") {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ""
}

function TasksRoute() {
	const t = useTranslations("Tasks")

	const tasksQuery = useQuery(
		queryOrpcNext.task.listRecent.queryOptions({
			input: { limit: RECENT_LIMIT, offset: 0 },
		}),
	)

	const items = tasksQuery.data?.items ?? []

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8 flex items-center justify-between gap-4">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
							<p className="mt-1 text-sm text-muted-foreground">{t("lists.recent")}</p>
						</div>
						<Button variant="secondary" onClick={() => tasksQuery.refetch()}>
							{t("refresh")}
						</Button>
					</div>

					{tasksQuery.isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading…
						</div>
					) : null}

					{tasksQuery.isError ? (
						<div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
							Failed to load tasks.
						</div>
					) : null}

					{!tasksQuery.isLoading && !tasksQuery.isError && items.length === 0 ? (
						<div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
							{t("empty")}
						</div>
					) : null}

					{items.length > 0 ? (
						<div className="space-y-3">
							{items.map((task) => {
								const createdAt = toDateLabel(task.createdAt)
								const updatedAt = toDateLabel(task.updatedAt)
								const finishedAt = toDateLabel(task.finishedAt)

								const canOpenMedia =
									task.targetType === "media" && typeof task.targetId === "string"

								return (
									<div key={task.id} className="glass rounded-2xl p-4">
										<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
												{task.kind}
											</span>
											<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
												{task.status}
											</span>
											{typeof task.progress === "number" ? (
												<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
													{t("progress")}: {task.progress}%
												</span>
											) : null}
											{updatedAt ? <span className="ml-auto">{updatedAt}</span> : null}
										</div>

										<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
											<div className="text-sm">
												<div className="font-medium text-foreground">
													{t("targetLabel")}: {task.targetType}/{task.targetId}
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													{createdAt ? `${t("timestamps.created")}: ${createdAt}` : null}
													{finishedAt ? ` · ${t("timestamps.finished")}: ${finishedAt}` : null}
												</div>
												{task.error ? (
													<div className="mt-2 text-xs text-destructive">{task.error}</div>
												) : null}
											</div>

											{canOpenMedia ? (
												<Button variant="secondary" asChild>
													<Link to="/media/$id" params={{ id: task.targetId! }}>
														Open media
													</Link>
												</Button>
											) : null}
										</div>
									</div>
								)
							})}
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

