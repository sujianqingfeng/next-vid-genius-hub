'use client'

import { useQuery } from '@tanstack/react-query'
import { ListChecks, RefreshCw, Search, SquarePen } from 'lucide-react'
import { useTranslations } from '~/lib/i18n'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'
import { type schema } from '~/lib/db'
import { queryOrpc } from '~/lib/orpc/query-client'

type Task = typeof schema.tasks.$inferSelect

const STATUS_COLOR: Record<string, string> = {
	queued: 'bg-amber-100 text-amber-800 border-amber-200',
	fetching_metadata: 'bg-sky-100 text-sky-800 border-sky-200',
	preparing: 'bg-blue-100 text-blue-800 border-blue-200',
	running: 'bg-indigo-100 text-indigo-800 border-indigo-200',
	uploading: 'bg-cyan-100 text-cyan-800 border-cyan-200',
	completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
	failed: 'bg-rose-100 text-rose-800 border-rose-200',
	canceled: 'bg-slate-100 text-slate-800 border-slate-200',
}

function StatusBadge({ status }: { status?: Task['status'] }) {
	const tStatus = useTranslations('Tasks.status')
	if (!status) return null
	const cls = STATUS_COLOR[status] ?? 'bg-secondary text-secondary-foreground border-secondary/30'
	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
			{tStatus(status)}
		</span>
	)
}

function TaskTimeline({ tasks }: { tasks: Task[] }) {
	const t = useTranslations('Tasks')
	const formatRelative = (d?: Date | null) => {
		if (!d) return ''
		const diff = Date.now() - d.getTime()
		const sec = Math.max(0, Math.round(diff / 1000))
		if (sec < 60) return `${sec}s`
		const min = Math.round(sec / 60)
		if (min < 60) return `${min}m`
		const hr = Math.round(min / 60)
		if (hr < 24) return `${hr}h`
		const day = Math.round(hr / 24)
		return `${day}d`
	}

	if (tasks.length === 0) {
		return (
			<Card className="border-dashed">
				<CardContent className="py-10 text-center text-muted-foreground">
					<div className="mx-auto mb-4 h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center">
						<ListChecks className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
					</div>
					{t('empty')}
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{tasks.map((task) => {
				const createdAt = task.createdAt ? new Date(task.createdAt) : null
				const finishedAt = task.finishedAt ? new Date(task.finishedAt) : null
				const updatedAt = task.updatedAt ? new Date(task.updatedAt) : null
				const timeText =
					finishedAt?.getTime() === createdAt?.getTime()
						? '0s'
						: formatRelative(updatedAt || createdAt || new Date())
				return (
					<Card key={task.id} className="border border-border/60 shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
							<div className="space-y-1">
								<CardTitle className="text-base font-semibold">
									{task.kind} · {task.engine}
								</CardTitle>
								<div className="text-xs text-muted-foreground space-x-3">
									<span>ID: {task.id}</span>
									{task.jobId && <span>Job: {task.jobId}</span>}
								</div>
							</div>
							<StatusBadge status={task.status} />
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<div className="flex flex-wrap items-center gap-3">
								<span className="text-foreground font-medium">{t('targetLabel')}:</span>
								<span className="px-2 py-1 rounded bg-secondary/50 text-foreground text-xs">
									{task.targetType} / {task.targetId}
								</span>
								{typeof task.progress === 'number' && (
									<span className="text-xs">
										{t('progress')}: {task.progress}%
									</span>
								)}
							</div>
							{task.error && (
								<p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded px-3 py-2">
									{task.error}
								</p>
							)}
							<div className="text-xs text-muted-foreground">
								{createdAt && (
									<span className="mr-3">
										{t('timestamps.created')}: {createdAt.toLocaleString()}
									</span>
								)}
								{updatedAt && (
									<span className="mr-3">
										{t('timestamps.updated')}: {updatedAt.toLocaleString()}
									</span>
								)}
								{finishedAt && (
									<span>
										{t('timestamps.finished')}: {finishedAt.toLocaleString()}
									</span>
								)}
							</div>
							<div className="text-xs text-foreground/70">
								{t('timestamps.relative', { time: timeText })}
							</div>
						</CardContent>
					</Card>
				)
			})}
		</div>
	)
}

type Props = {
	initialTargetType?: 'media' | 'channel' | 'system'
	initialTargetId?: string
}

export function TasksPage({ initialTargetType = 'media', initialTargetId = '' }: Props) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const t = useTranslations('Tasks')
	const [targetType, setTargetType] = useState<'media' | 'channel' | 'system'>(initialTargetType)
	const [targetId, setTargetId] = useState(initialTargetId)

	const queryEnabled = targetId.trim().length > 0

	const byTargetQuery = useQuery({
		...queryOrpc.task.listByTarget.queryOptions({
			input: { targetType, targetId, limit: 100, offset: 0 },
		}),
		enabled: queryEnabled,
	})

	const recentQuery = useQuery({
		...queryOrpc.task.listRecent.queryOptions({
			input: { limit: 50, offset: 0 },
		}),
		enabled: !queryEnabled,
	})

	const tasks = useMemo(() => {
		if (queryEnabled) return byTargetQuery.data?.items ?? []
		return recentQuery.data?.items ?? []
	}, [queryEnabled, byTargetQuery.data, recentQuery.data])

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		const params = new URLSearchParams(searchParams.toString())
		params.set('targetType', targetType)
		params.set('targetId', targetId)
		router.push(`/tasks?${params.toString()}`)
		byTargetQuery.refetch()
	}

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/"
					showBackButton={false}
					title={t('title')}
					rightContent={
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								if (queryEnabled) {
									byTargetQuery.refetch()
								} else {
									recentQuery.refetch()
								}
							}}
						>
							<RefreshCw className="mr-2 h-4 w-4" strokeWidth={1.5} />
							{t('refresh')}
						</Button>
					}
				/>
			}
		>
			<div className="space-y-8">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base font-semibold flex items-center gap-2">
						<Search className="h-4 w-4" strokeWidth={1.5} />
						{t('filter')}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
						<div className="flex-1">
							<Label htmlFor="targetId">{t('targetId')}</Label>
							<Input
								id="targetId"
								placeholder="media id / channel id"
								value={targetId}
								onChange={(e) => setTargetId(e.target.value)}
								className="mt-1"
							/>
						</div>
						<div className="w-full sm:w-48">
							<Label>{t('targetType')}</Label>
							<Select
								value={targetType}
								onValueChange={(v) => setTargetType(v as 'media' | 'channel' | 'system')}
							>
								<SelectTrigger className="mt-1">
									<SelectValue placeholder={t('targetTypePlaceholder')} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="media">{t('select.media')}</SelectItem>
									<SelectItem value="channel">{t('select.channel')}</SelectItem>
									<SelectItem value="system">{t('select.system')}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Button type="submit" className="sm:w-32">
							<SquarePen className="h-4 w-4 mr-2" strokeWidth={1.5} />
							{t('load')}
						</Button>
					</form>
				</CardContent>
			</Card>

			{recentQuery.isLoading && !queryEnabled && (
				<div className="space-y-3">
					{Array.from({ length: 3 }).map((_, idx) => (
						<Card key={idx}>
							<CardContent className="p-4 space-y-3">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-3 w-64" />
								<Skeleton className="h-3 w-52" />
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{byTargetQuery.isLoading && queryEnabled && (
				<div className="space-y-3">
					{Array.from({ length: 3 }).map((_, idx) => (
						<Card key={idx}>
							<CardContent className="p-4 space-y-3">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-3 w-64" />
								<Skeleton className="h-3 w-52" />
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{byTargetQuery.isError && queryEnabled && (
				<Card className="border-destructive/30 bg-destructive/5">
					<CardContent className="py-6 text-destructive">
						{t('errors.byTarget', {
							message: byTargetQuery.error?.message ?? 'unknown error',
						})}
					</CardContent>
				</Card>
			)}

			{recentQuery.isError && !queryEnabled && (
				<Card className="border-destructive/30 bg-destructive/5">
					<CardContent className="py-6 text-destructive">
						{t('errors.recent', {
							message: recentQuery.error?.message ?? 'unknown error',
						})}
					</CardContent>
				</Card>
			)}

			{((byTargetQuery.isSuccess && queryEnabled) || (recentQuery.isSuccess && !queryEnabled)) && (
				<div className="space-y-2">
					<div className="text-sm text-muted-foreground">
						{queryEnabled ? t('lists.forTarget') : t('lists.recent')}
					</div>
					<TaskTimeline tasks={tasks} />
				</div>
			)}
		</div>
		</WorkspacePageShell>
	)
}
