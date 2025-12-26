import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

type Props = {
	jobId?: string
	taskId?: string
	limit: number
	setSearch: (next: { jobId?: string; taskId?: string; limit?: number }) => void
}

function toDateLabel(value: unknown): string {
	if (value instanceof Date) return value.toLocaleString()
	if (typeof value === 'number' || typeof value === 'string') {
		const d = new Date(value)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ''
}

export function AdminJobEventsPage({ jobId, taskId, limit, setSearch }: Props) {
	const t = useTranslations('Admin.jobEvents')
	const [jobIdInput, setJobIdInput] = React.useState(jobId ?? '')
	const [taskIdInput, setTaskIdInput] = React.useState(taskId ?? '')
	const [limitInput, setLimitInput] = React.useState(String(limit))

	React.useEffect(() => setJobIdInput(jobId ?? ''), [jobId])
	React.useEffect(() => setTaskIdInput(taskId ?? ''), [taskId])
	React.useEffect(() => setLimitInput(String(limit)), [limit])

	const queryInput = React.useMemo(
		() => ({
			jobId: jobId || undefined,
			taskId: taskId || undefined,
			limit,
		}),
		[jobId, taskId, limit],
	)

	const eventsQuery = useQuery(
		queryOrpc.admin.listJobEvents.queryOptions({ input: queryInput }),
	)
	const items = eventsQuery.data?.items ?? []

	const onApply = () => {
		const nextJobId = jobIdInput.trim() || undefined
		const nextTaskId = taskIdInput.trim() || undefined
		const parsedLimit = Number.parseInt(limitInput, 10)
		const nextLimit = Number.isFinite(parsedLimit)
			? Math.max(1, Math.min(200, Math.trunc(parsedLimit)))
			: 100
		setSearch({ jobId: nextJobId, taskId: nextTaskId, limit: nextLimit })
	}

	const onClear = () => {
		setJobIdInput('')
		setTaskIdInput('')
		setLimitInput('100')
		setSearch({ jobId: undefined, taskId: undefined, limit: 100 })
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-xl font-bold uppercase tracking-tight font-mono">
						{t('title')}
					</h1>
					<p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
						{t('subtitle')}
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					onClick={() => eventsQuery.refetch()}
					disabled={eventsQuery.isFetching}
					className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
				>
					<RefreshCcw className="mr-2 h-3 w-3" />
					{eventsQuery.isFetching ? t('actions.refreshing') : t('actions.refresh')}
				</Button>
			</div>

			<div className="border border-border bg-card p-4 space-y-4">
				<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
					<div className="space-y-1">
						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
							{t('fields.jobId')}
						</div>
						<Input
							value={jobIdInput}
							onChange={(e) => setJobIdInput(e.target.value)}
							placeholder={t('placeholders.jobId')}
							className="rounded-none font-mono text-xs"
						/>
					</div>

					<div className="space-y-1">
						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
							{t('fields.taskId')}
						</div>
						<Input
							value={taskIdInput}
							onChange={(e) => setTaskIdInput(e.target.value)}
							placeholder={t('placeholders.taskId')}
							className="rounded-none font-mono text-xs"
						/>
					</div>

					<div className="space-y-1">
						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">
							{t('fields.limit')}
						</div>
						<Input
							value={limitInput}
							onChange={(e) => setLimitInput(e.target.value)}
							placeholder="100"
							inputMode="numeric"
							className="rounded-none font-mono text-xs"
						/>
					</div>

					<div className="flex items-end gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={onApply}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-9"
						>
							{t('actions.apply')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={onClear}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-9"
						>
							<X className="mr-2 h-3 w-3" />
							{t('actions.clear')}
						</Button>
					</div>
				</div>

				<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
					{t('stats', { count: items.length, limit })}
				</div>
			</div>

			<div className="border border-border bg-card">
				<div className="grid grid-cols-12 gap-3 border-b border-border bg-muted/20 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
					<div className="col-span-2">{t('cols.time')}</div>
					<div className="col-span-1">{t('cols.source')}</div>
					<div className="col-span-2">{t('cols.kind')}</div>
					<div className="col-span-3">{t('cols.jobId')}</div>
					<div className="col-span-2">{t('cols.taskId')}</div>
					<div className="col-span-1">{t('cols.status')}</div>
					<div className="col-span-1">{t('cols.seq')}</div>
				</div>

				{items.length === 0 ? (
					<div className="p-8 text-center text-xs font-mono uppercase tracking-widest text-muted-foreground opacity-70">
						{eventsQuery.isLoading ? t('loading') : t('empty')}
					</div>
				) : (
					<div className="divide-y divide-border">
						{items.map((e) => {
							const payloadText =
								typeof e.payload === 'string' ? e.payload : undefined
							return (
								<details
									key={e.id}
									className="group px-4 py-3 hover:bg-muted/10"
								>
									<summary className="cursor-pointer list-none">
										<div className="grid grid-cols-12 gap-3 items-start text-xs font-mono">
											<div className="col-span-2 text-muted-foreground">
												{toDateLabel(e.createdAt)}
											</div>
											<div className="col-span-1">
												{String(e.source ?? '')}
											</div>
											<div className="col-span-2">{String(e.kind ?? '')}</div>
											<div className="col-span-3 truncate">
												{String(e.jobId ?? '')}
											</div>
											<div className="col-span-2 truncate text-muted-foreground">
												{String(e.taskId ?? '')}
											</div>
											<div className="col-span-1">{String(e.status ?? '')}</div>
											<div className="col-span-1 text-muted-foreground">
												{typeof e.eventSeq === 'number' ? e.eventSeq : ''}
											</div>
										</div>
										{e.message ? (
											<div className="mt-2 text-[11px] text-muted-foreground font-mono break-words">
												{String(e.message)}
											</div>
										) : null}
									</summary>

									<div className="mt-3 grid grid-cols-1 gap-3">
										<div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground">
											<div>
												purpose: <span className="text-foreground">{String(e.purpose ?? '')}</span>
											</div>
											<div>
												eventId: <span className="text-foreground">{String(e.eventId ?? '')}</span>
											</div>
											<div>
												eventTs: <span className="text-foreground">{toDateLabel(e.eventTs)}</span>
											</div>
										</div>

										{payloadText ? (
											<pre className="max-h-[360px] overflow-auto border border-border bg-muted/10 p-3 text-[11px] leading-relaxed">
												{payloadText}
											</pre>
										) : (
											<div className="text-[11px] font-mono text-muted-foreground">
												(no payload)
											</div>
										)}
									</div>
								</details>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

