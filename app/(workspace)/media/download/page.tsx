'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Link, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Progress } from '~/components/ui/progress'
import { Switch } from '~/components/ui/switch'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { STATUS_LABELS, PHASE_LABELS } from '~/lib/config/media-status'
import { TERMINAL_JOB_STATUSES } from '@app/media-domain'
import { queryOrpc } from '~/lib/orpc/query-client'
import { orpc } from '~/lib/orpc/client'

export default function NewDownloadPage() {
	const t = useTranslations('Download.page')
	const [error, setError] = useState<string | null>(null)
	const [urlValue, setUrlValue] = useState<string>('')
	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [cloudJobId, setCloudJobId] = useState<string | null>(null)
	const [cloudMediaId, setCloudMediaId] = useState<string | null>(null)
	const [lastCloudStatus, setLastCloudStatus] = useState<string | null>(null)
	// Auto-rotate (cloud only)
	const [autoRotate, setAutoRotate] = useState<boolean>(false)
	const [maxAttempts, setMaxAttempts] = useState<number>(20)
	const [rotationScope, setRotationScope] = useState<'selectedFirst' | 'all'>('selectedFirst')
	const [attempt, setAttempt] = useState<number>(0) // counts the current attempt (initial submit = 1)
	const [rotationQueue, setRotationQueue] = useState<string[]>([])
	const [autoRetryStopped, setAutoRetryStopped] = useState<boolean>(false)
	const [lastInput, setLastInput] = useState<{ url: string; quality: '1080p' | '720p' } | null>(null)

	// Fetch proxies to build rotation pool (order already desc(createdAt))
	const proxiesQuery = useQuery({
		...queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	})

	function buildRotationQueue(
		all: Array<{ id: string }>,
		selectedId: string,
		scope: 'selectedFirst' | 'all',
	): string[] {
		const ids = (all || []).map((p) => p.id).filter((id) => id !== 'none')
		if (ids.length === 0) return []
		if (scope === 'all') return ids
		// selectedFirst: if selected is a real proxy, start with it; otherwise start with first available
		const start = selectedId !== 'none' && ids.includes(selectedId) ? selectedId : ids[0]
		const rest = ids.filter((id) => id !== start)
		return [start, ...rest]
	}

	function renderProxyLabel(id: string | undefined): string {
		if (!id || id === 'none') return t('autoRotate.noProxy')
		const p = proxiesQuery.data?.proxies?.find((x) => x.id === id)
		if (!p) return id
		const label = p.name || `${p.protocol}://${p.server}:${p.port}`
		return label
	}

	const cloudDownloadMutation = useMutation(
		queryOrpc.download.startCloudDownload.mutationOptions({
			onSuccess: (data) => {
				setError(null)
				setCloudJobId(data.jobId)
				setCloudMediaId(data.mediaId)
				setLastCloudStatus(null)
				// keep attempt counter if auto-rotation is enabled; otherwise reset
				if (!autoRotate) setAttempt(0)
				toast.success(t('toasts.queued'))
			},
			onError: (err: Error) => {
				console.error(err)
				setError(err.message || t('errors.queueFailed'))
			},
		}),
	)

	const cloudStatusQuery = useQuery({
		queryKey: ['download.getCloudDownloadStatus', cloudJobId],
		queryFn: async () => {
			if (!cloudJobId) throw new Error(t('errors.missingJob'))
			return await orpc.download.getCloudDownloadStatus({ jobId: cloudJobId })
		},
		enabled: !!cloudJobId,
		refetchInterval: (query) => {
			const status = query.state.data?.status
			if (!status) return 5000
			return status && TERMINAL_JOB_STATUSES.includes(status) ? false : 5000
		},
	})

	const statusLabel = cloudStatusQuery.data?.status
		? STATUS_LABELS[cloudStatusQuery.data.status] ?? cloudStatusQuery.data.status
		: null
	const phaseLabel = cloudStatusQuery.data?.phase
		? PHASE_LABELS[cloudStatusQuery.data.phase] ?? cloudStatusQuery.data.phase
		: null
	const isSubmitting = cloudDownloadMutation.isPending

	const availableProxyOptions = proxiesQuery.data?.proxies?.filter((proxy) => proxy.id !== 'none') ?? []
	const hasAvailableProxies = availableProxyOptions.length > 0
	const hasSelectedProxy = Boolean(selectedProxyId && selectedProxyId !== 'none')
	const progressPercent = typeof cloudStatusQuery.data?.progress === 'number'
		? Math.round(cloudStatusQuery.data.progress * 100)
		: null
	const jobActive = Boolean(cloudJobId)
	const rotationActive = autoRotate && !autoRetryStopped
	const rotationSummary = rotationActive
		? t('rotation.summary', { attempt: Math.min(attempt, maxAttempts), max: maxAttempts })
		: t('rotation.disabled')

	const handleReset = () => {
		setUrlValue('')
		setSelectedProxyId('none')
		setAutoRotate(false)
		setMaxAttempts(20)
		setRotationScope('selectedFirst')
		setAttempt(0)
		setRotationQueue([])
		setLastInput(null)
		setAutoRetryStopped(false)
		setError(null)
	}

	const formAction = async (formData: FormData) => {
		if (!hasSelectedProxy) {
			const proxyMessage = hasAvailableProxies
				? t('errors.missingProxy')
				: t('errors.noProxy')
			setError(proxyMessage)
			toast.error(proxyMessage)
			return
		}

		const url = (urlValue || (formData.get('url') as string) || '').trim()
		const quality = formData.get('quality') as '1080p' | '720p'

		if (!url) {
			setError(t('errors.missingUrl'))
			return
		}

		setError(null)
		setLastInput({ url, quality })
		setAutoRetryStopped(false)
		const all = proxiesQuery.data?.proxies ?? []
		const queue = buildRotationQueue(all, selectedProxyId, rotationScope)
		// For rotation queue, remove the first element if it equals the selected proxy, because
		// initial submit uses the selected proxy (attempt #1)
		const nextQueue = queue.filter((id) => id !== selectedProxyId)
		setRotationQueue(nextQueue)
		setAttempt(1) // initial cloud submit counts as attempt #1
		cloudDownloadMutation.mutate({
			url,
			quality,
			proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId,
		})
	}

	useEffect(() => {
		const status = cloudStatusQuery.data?.status
		if (!status || !cloudJobId) return
		if (status === lastCloudStatus) return
		setLastCloudStatus(status)

		if (status === 'completed') {
			toast.success(t('toasts.completed'))
			// Clear the URL field after a successful cloud job
			setUrlValue('')
			return
		}
		if (status === 'canceled') {
			toast.warning(t('toasts.canceled'))
			return
		}
		if (status === 'failed') {
			// Normal failure notification
			const message = cloudStatusQuery.data?.message
			toast.error(message ? t('toasts.failedWithMessage', { message }) : t('toasts.failed'))
			setError(message || t('toasts.failed'))

			// Auto-rotate retry (cloud only)
			if (
				autoRotate &&
				!autoRetryStopped &&
				attempt < maxAttempts &&
				rotationQueue.length > 0
			) {
				const nextIndex = attempt - 1 // since attempt includes the initial submit
				const nextProxyId = rotationQueue[nextIndex]
				if (nextProxyId) {
					const backoffMs = 1000 * attempt
					const url = lastInput?.url
					const quality = lastInput?.quality
					if (url && quality) {
						setTimeout(() => {
							setSelectedProxyId(nextProxyId)
							cloudDownloadMutation.mutate({
								url,
								quality,
								proxyId: nextProxyId === 'none' ? undefined : nextProxyId,
							})
							setAttempt((a) => a + 1)
							setLastCloudStatus(null)
						}, backoffMs)
					}
				}
			}
		}
	}, [
		autoRotate,
		autoRetryStopped,
		attempt,
		maxAttempts,
		rotationQueue,
		cloudStatusQuery.data?.status,
		cloudStatusQuery.data?.message,
		cloudJobId,
		lastCloudStatus,
		cloudDownloadMutation,
		lastInput,
	])

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/media"
					title={t('title')}
				/>
			}
		>
			<div className="mx-auto w-full max-w-5xl space-y-8">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),360px]">
					<form action={formAction} className="space-y-6">
						<Card className="glass border-none shadow-sm">
							<CardHeader className="border-b border-border/40 pb-6 space-y-2">
								<CardTitle className="text-xl">{t('form.title')}</CardTitle>
								<CardDescription className="text-base font-light">
									{t('form.desc')}
								</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 space-y-8">
								<div className="space-y-3">
									<label htmlFor="url" className="text-sm font-medium text-foreground/80">
										{t('form.urlLabel')}
									</label>
									<div className="group relative">
										<Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" strokeWidth={1.5} />
										<Input
											id="url"
											name="url"
											type="url"
											placeholder={t('form.urlPlaceholder')}
											required
											disabled={isSubmitting}
											value={urlValue}
											onChange={(e) => setUrlValue(e.target.value)}
											className="h-12 border-border/50 bg-background/50 pl-10 transition-all focus:border-primary/50"
										/>
									</div>
								</div>

								<div className="grid gap-6 sm:grid-cols-2">
									<div className="space-y-3">
										<label htmlFor="quality" className="text-sm font-medium text-foreground/80">
											{t('form.quality')}
										</label>
										<div className="space-y-2">
											<Select name="quality" defaultValue="1080p" disabled={isSubmitting}>
												<SelectTrigger id="quality" className="h-10 border-border/50 bg-background/50">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="1080p">{t('form.quality1080')}</SelectItem>
													<SelectItem value="720p">{t('form.quality720')}</SelectItem>
												</SelectContent>
											</Select>
											<p className="text-[10px] font-light text-muted-foreground">
												{t('form.desc')}
											</p>
										</div>
									</div>
								</div>

								<div className="space-y-3">
									<label className="text-sm font-medium text-foreground/80">
										{t('form.proxyLabel')}
									</label>
									<div className="space-y-2">
										<ProxySelector
											value={selectedProxyId}
											onValueChange={setSelectedProxyId}
											disabled={isSubmitting}
											allowDirect={false}
										/>
										{!hasSelectedProxy && (
											<p className="text-[10px] font-medium text-destructive">
												{t('errors.missingProxy')}
											</p>
										)}
									</div>
								</div>

								<div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-5">
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-1">
											<p className="text-sm font-medium text-foreground">
												{t('form.rotateLabel')}
											</p>
											<p className="text-xs font-light text-muted-foreground">
												{t('form.rotateHint')}
											</p>
										</div>
										<Switch
											checked={autoRotate}
											onCheckedChange={(v) => setAutoRotate(Boolean(v))}
											disabled={isSubmitting}
											className="data-[state=checked]:bg-primary"
										/>
									</div>
									{autoRotate && (
										<div className="mt-5 grid gap-5 animate-in fade-in slide-in-from-top-2 duration-300 sm:grid-cols-2">
											<div className="space-y-2">
												<label
													htmlFor="maxAttempts"
													className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
												>
													{t('form.maxAttempts')}
												</label>
												<Input
													id="maxAttempts"
													type="number"
													min={1}
													max={50}
													value={maxAttempts}
													onChange={(e) =>
														setMaxAttempts(
															Math.max(
																1,
																Math.min(50, Number(e.target.value) || 1),
															),
														)
													}
													disabled={isSubmitting || !autoRotate}
													className="h-9 border-border/50 bg-background/50"
												/>
											</div>
											<div className="space-y-2">
												<label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
													{t('form.scope.label')}
												</label>
												<Select
													value={rotationScope}
													onValueChange={(v) =>
														setRotationScope(
															(v as 'selectedFirst' | 'all') || 'selectedFirst',
														)
													}
													disabled={isSubmitting || !autoRotate}
												>
													<SelectTrigger className="h-9 border-border/50 bg-background/50">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="selectedFirst">
															{t('form.scope.selectedFirst')}
														</SelectItem>
														<SelectItem value="all">
															{t('form.scope.all')}
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
								</div>

								{error && (
									<div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
										<div className="h-1.5 w-1.5 rounded-full bg-destructive" />
										{error}
									</div>
								)}
							</CardContent>
							<CardFooter className="mt-6 flex flex-col gap-4 border-t border-border/40 pt-2 pb-6 sm:flex-row sm:items-center">
								<Button
									type="submit"
									className="h-12 flex-1 text-base shadow-md transition-all hover:shadow-lg"
									disabled={isSubmitting || !hasSelectedProxy}
								>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-5 w-5 animate-spin" />
											{t('form.submitPending')}
										</>
									) : (
										<>
											<Download className="mr-2 h-5 w-5" strokeWidth={1.5} />
											{t('form.submit')}
										</>
									)}
								</Button>
								<Button
									type="button"
									variant="ghost"
									className="h-12 sm:w-auto hover:bg-secondary/50"
									onClick={handleReset}
								>
									{t('form.reset')}
								</Button>
							</CardFooter>
						</Card>
					</form>

					<div className="space-y-6">
						<Card className="glass sticky top-6 h-fit border-none shadow-sm">
							<CardHeader className="border-b border-border/40 pb-4 space-y-2">
								<CardTitle className="flex items-center gap-2 text-lg font-semibold">
									<Download className="h-5 w-5 text-primary" strokeWidth={1.5} />
									{t('progress.title')}
								</CardTitle>
								<CardDescription className="text-xs font-light">
									{t('progress.hint')}
								</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 space-y-6">
								<div className="space-y-3">
									<div className="flex items-center justify-between text-sm">
										<span className="font-medium text-muted-foreground">
											{t('progress.status')}
										</span>
										<span
											className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
												jobActive
													? 'bg-primary/10 text-primary'
													: 'bg-secondary text-muted-foreground'
											}`}
										>
											{jobActive
												? statusLabel ?? t('progress.queued')
												: t('progress.idle')}
										</span>
									</div>
									<Progress value={progressPercent ?? 0} className="h-2" />
									{phaseLabel && (
										<div className="flex items-center justify-between text-xs text-muted-foreground">
											<span>{t('progress.phase')}</span>
											<span className="font-medium text-foreground">
												{phaseLabel}
											</span>
										</div>
									)}
								</div>

								<div className="space-y-3 border-t border-border/40 pt-4">
									<div className="flex items-center justify-between gap-2 text-xs">
										<span className="text-muted-foreground">
											{t('progress.labels.jobId')}
										</span>
										<span className="rounded bg-secondary/30 px-1.5 py-0.5 font-mono text-foreground">
											{cloudJobId ? `${cloudJobId.slice(0, 8)}...` : '—'}
										</span>
									</div>
									<div className="flex items-center justify-between gap-2 text-xs">
										<span className="text-muted-foreground">
											{t('progress.labels.mediaId')}
										</span>
										<span className="rounded bg-secondary/30 px-1.5 py-0.5 font-mono text-foreground">
											{cloudMediaId ? `${cloudMediaId.slice(0, 8)}...` : '—'}
										</span>
									</div>
									<div className="flex items-center justify-between gap-2 text-xs">
										<span className="text-muted-foreground">
											{t('progress.labels.proxy')}
										</span>
										<span
											className="max-w-[60%] truncate font-medium text-foreground"
											title={renderProxyLabel(selectedProxyId)}
										>
											{renderProxyLabel(selectedProxyId)}
										</span>
									</div>
									<div className="flex items-center justify-between gap-2 text-xs">
										<span className="text-muted-foreground">
											{t('progress.labels.autoRetry')}
										</span>
										<span className="font-medium text-foreground">
											{rotationSummary}
										</span>
									</div>
								</div>

								{cloudStatusQuery.data?.message && (
									<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs font-medium text-destructive">
										{cloudStatusQuery.data.message}
									</div>
								)}
							</CardContent>
							{rotationActive && (
								<CardFooter className="mt-2 flex justify-end border-t border-border/40 pt-2 pb-6">
									<Button
										variant="secondary"
										size="sm"
										disabled={autoRetryStopped || isSubmitting}
										onClick={() => setAutoRetryStopped(true)}
										className="w-full bg-secondary/80 hover:bg-secondary"
									>
										{t('progress.labels.autoRetry')}
									</Button>
								</CardFooter>
							)}
						</Card>

						<div className="rounded-xl bg-secondary/20 p-4 text-xs font-light leading-relaxed text-muted-foreground">
							{t('progress.footer')}
						</div>
					</div>
				</div>
			</div>
		</WorkspacePageShell>
	)
}
