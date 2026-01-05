'use client'

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { getBcp47Locale, useLocale, useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc'

function toDateLabel(input: unknown, locale: string): string {
	if (input instanceof Date) return input.toLocaleString(locale)
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString(locale)
	}
	return ''
}

export function TasksPage({ recentLimit = 50 }: { recentLimit?: number }) {
	const t = useTranslations('Tasks')
	const locale = useLocale()
	const dateLocale = getBcp47Locale(locale)

	const tasksQuery = useQuery(
		queryOrpc.task.listRecent.queryOptions({
			input: { limit: recentLimit, offset: 0 },
		}),
	)

	const items = tasksQuery.data?.items ?? []

	return (
		<div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-primary" />
									{t('ui.breadcrumb.system')}
								</span>
								<span>/</span>
								<span>{t('ui.breadcrumb.section')}</span>
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('title')}
							</h1>
							<div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-70">
								{t('lists.recent')}
							</div>
						</div>

						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							onClick={() => tasksQuery.refetch()}
							disabled={tasksQuery.isLoading}
						>
							<Loader2
								className={`mr-2 h-3 w-3 ${tasksQuery.isLoading ? 'animate-spin' : 'hidden'}`}
							/>
							[ {t('refresh')} ]
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
				<div className="space-y-6">
					{tasksQuery.isLoading && !items.length && (
						<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" />
							{t('ui.polling')}
						</div>
					)}

					{tasksQuery.isError ? (
						<div className="border border-destructive/50 bg-destructive/5 p-4 font-mono text-xs uppercase tracking-wider text-destructive">
							{t('errors.recent', {
								message:
									tasksQuery.error instanceof Error
										? tasksQuery.error.message
										: String(tasksQuery.error),
							})}
						</div>
					) : null}

					{!tasksQuery.isLoading && items.length === 0 ? (
						<div className="border border-dashed border-border p-12 text-center">
							<div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
								{t('empty')}
							</div>
						</div>
					) : null}

					{items.length > 0 && (
						<div className="space-y-4">
							<div className="border border-border bg-card">
								<div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
									<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('ui.monitor.title')}
									</div>
									<div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground opacity-50">
										{t('ui.monitor.activeNodes', { count: items.length })}
									</div>
								</div>

								<div className="divide-y divide-border">
									{items.map((task) => {
										const createdAt = toDateLabel(task.createdAt, dateLocale)
										const updatedAt = toDateLabel(task.updatedAt, dateLocale)
										const finishedAt = toDateLabel(task.finishedAt, dateLocale)

										const canOpenMedia =
											task.targetType === 'media' &&
											typeof task.targetId === 'string'

										const isError = task.status === 'failed'
										const isSuccess = task.status === 'completed'

										return (
											<div
												key={task.id}
												className="group p-4 transition-colors hover:bg-muted/10"
											>
												<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
													<div className="min-w-0 flex-1 space-y-3">
														<div className="flex flex-wrap items-center gap-3">
															<div className="bg-primary/5 border border-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
																{task.kind}
															</div>
															<div
																className={`px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border ${
																	isError
																		? 'bg-destructive/10 border-destructive/20 text-destructive'
																		: isSuccess
																			? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
																			: 'bg-primary/5 border-primary/10'
																}`}
															>
																{task.status}
															</div>
															{typeof task.progress === 'number' && (
																<div className="flex items-center gap-2">
																	<div className="w-24 h-1.5 border border-border bg-muted/30 overflow-hidden">
																		<div
																			className="h-full bg-primary transition-all duration-500"
																			style={{ width: `${task.progress}%` }}
																		/>
																	</div>
																	<span className="font-mono text-[10px] font-bold">
																		{task.progress}%
																	</span>
																</div>
															)}
															<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
																ID:{' '}
																<span className="text-foreground">
																	{task.id}
																</span>
															</div>
														</div>

														<div className="space-y-1">
															<div className="font-mono text-xs font-bold uppercase tracking-wide">
																<span className="text-muted-foreground">
																	{t('targetLabel')}:
																</span>{' '}
																{task.targetType}/{task.targetId}
															</div>
															<div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
																{createdAt && (
																	<span>[CREATED: {createdAt}]</span>
																)}
																{updatedAt && (
																	<span>[LAST_POLL: {updatedAt}]</span>
																)}
																{finishedAt && (
																	<span className="text-primary font-bold">
																		[TERMINATED: {finishedAt}]
																	</span>
																)}
															</div>
														</div>

														{task.error && (
															<div className="border border-destructive/20 bg-destructive/5 p-2 font-mono text-[10px] uppercase text-destructive break-all">
																» SYSTEM_FAULT: {task.error}
															</div>
														)}
													</div>

													<div className="flex flex-shrink-0 gap-2 self-start sm:self-center">
														{canOpenMedia && (
															<Button
																variant="outline"
																size="sm"
																className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
																asChild
															>
																<Link
																	to="/media/$id"
																	params={{ id: task.targetId! }}
																>
																	VIEW_TARGET_DATA
																</Link>
															</Button>
														)}
													</div>
												</div>
											</div>
										)
									})}
								</div>

								<div className="border-t border-border bg-muted/5 px-4 py-2">
									<div className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground text-right">
										Queue_Terminal_Status: Ready_For_Operation
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
