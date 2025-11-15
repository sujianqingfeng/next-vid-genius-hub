'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Link, Loader2, Cloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { STATUS_LABELS, PHASE_LABELS } from '~/lib/config/media-status.config'
import { queryOrpc } from '~/lib/orpc/query-client'
import { orpc } from '~/lib/orpc/client'

export default function NewDownloadPage() {
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
		if (!id || id === 'none') return 'No Proxy (Direct)'
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
				toast.success('Cloud download queued!')
			},
			onError: (err: Error) => {
				console.error(err)
				setError(err.message || 'Failed to queue cloud download')
			},
		}),
	)

	const cloudStatusQuery = useQuery({
		queryKey: ['download.getCloudDownloadStatus', cloudJobId],
		queryFn: async () => {
			if (!cloudJobId) throw new Error('jobId not set')
			return await orpc.download.getCloudDownloadStatus({ jobId: cloudJobId })
		},
		enabled: !!cloudJobId,
		refetchInterval: (query) => {
			const status = query.state.data?.status
			if (!status) return 5000
			return ['completed', 'failed', 'canceled'].includes(status) ? false : 5000
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
		? `Attempt ${Math.min(attempt, maxAttempts)} / ${maxAttempts}`
		: 'Disabled'

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
				? 'Pick a proxy before starting the download.'
				: 'No proxies available. Please add one first.'
			setError(proxyMessage)
			toast.error(proxyMessage)
			return
		}

		const url = (urlValue || (formData.get('url') as string) || '').trim()
		const quality = formData.get('quality') as '1080p' | '720p'

		if (!url) {
			setError('Please enter a valid URL')
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
			toast.success('Cloud download completed!')
			// Clear the URL field after a successful cloud job
			setUrlValue('')
			return
		}
		if (status === 'canceled') {
			toast.warning('Cloud download was canceled.')
			return
		}
		if (status === 'failed') {
			// Normal failure notification
			toast.error(cloudStatusQuery.data?.message || 'Cloud download failed.')
			setError(cloudStatusQuery.data?.message || 'Cloud download failed.')

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
		<div className="min-h-screen bg-muted/20 px-4 py-10">
			<div className="mx-auto w-full max-w-5xl space-y-8">
				<header className="flex flex-col items-center gap-3 text-center">
					<div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Cloud className="h-6 w-6" />
					</div>
					<div>
						<h1 className="text-3xl font-semibold">Cloud video download</h1>
						<p className="text-sm text-muted-foreground">Queue HD downloads in the worker cluster and monitor them live.</p>
					</div>
				</header>

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
					<form action={formAction} className="space-y-4">
						<Card>
							<CardHeader className="space-y-1">
								<CardTitle>New job</CardTitle>
								<CardDescription>Paste a link, select quality, and pick a proxy.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="space-y-2">
									<label htmlFor="url" className="text-sm font-medium">
										Video link
									</label>
									<div className="relative">
										<Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="url"
											name="url"
											type="url"
											placeholder="https://youtube.com/watch?v=..."
											required
											disabled={isSubmitting}
											value={urlValue}
											onChange={(e) => setUrlValue(e.target.value)}
											className="h-12 pl-10"
										/>
									</div>
								</div>

								<div className="space-y-2">
									<label htmlFor="quality" className="text-sm font-medium">
										Output quality
									</label>
									<Select name="quality" defaultValue="1080p" disabled={isSubmitting}>
										<SelectTrigger id="quality" className="h-10">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="1080p">1080p</SelectItem>
											<SelectItem value="720p">720p</SelectItem>
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">Use 720p only if throttling occurs.</p>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">Proxy</label>
									<ProxySelector
										value={selectedProxyId}
										onValueChange={setSelectedProxyId}
										disabled={isSubmitting}
										allowDirect={false}
									/>
									{!hasSelectedProxy && (
										<p className="text-xs text-destructive">Choose a proxy before submitting.</p>
									)}
								</div>

								<div className="rounded-lg border border-dashed border-border/70 p-4">
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-medium">Auto rotate proxies</p>
											<p className="text-xs text-muted-foreground">Retry with the next proxy when a job fails.</p>
										</div>
										<Switch
											checked={autoRotate}
											onCheckedChange={(v) => setAutoRotate(Boolean(v))}
											disabled={isSubmitting}
										/>
									</div>
									{autoRotate && (
										<div className="mt-4 grid gap-4 sm:grid-cols-2">
											<div className="space-y-2">
												<label htmlFor="maxAttempts" className="text-xs font-medium uppercase text-muted-foreground">
													Max attempts
												</label>
												<Input
													id="maxAttempts"
													type="number"
													min={1}
													max={50}
													value={maxAttempts}
													onChange={(e) =>
														setMaxAttempts(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
													}
													disabled={isSubmitting || !autoRotate}
													className="h-10"
												/>
											</div>
											<div className="space-y-2">
												<label className="text-xs font-medium uppercase text-muted-foreground">
													Rotation order
												</label>
												<Select
													value={rotationScope}
													onValueChange={(v) =>
														setRotationScope((v as 'selectedFirst' | 'all') || 'selectedFirst')
													}
													disabled={isSubmitting || !autoRotate}
												>
													<SelectTrigger className="h-10">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="selectedFirst">Selected proxy first</SelectItem>
														<SelectItem value="all">List order</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
								</div>

								{error && (
									<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
										{error}
									</div>
								)}
							</CardContent>
							<CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center">
								<Button type="submit" className="flex-1 h-12 text-base" disabled={isSubmitting || !hasSelectedProxy}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-5 w-5 animate-spin" />
											Queueing...
										</>
									) : (
										<>
											<Download className="mr-2 h-5 w-5" />
											Queue download
										</>
									)}
								</Button>
								<Button type="button" variant="ghost" className="h-12 sm:w-auto" onClick={handleReset}>
									Reset
								</Button>
							</CardFooter>
						</Card>
					</form>

					<div className="space-y-4">
						<Card>
							<CardHeader className="space-y-1">
								<CardTitle className="flex items-center gap-2 text-base font-semibold">
									<Download className="h-4 w-4" />
									Job status
								</CardTitle>
								<CardDescription>Updated roughly every five seconds.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">Status</span>
										<span className="font-medium">{jobActive ? statusLabel ?? 'Queued' : 'Idle'}</span>
									</div>
									<Progress value={progressPercent ?? 0} srLabel="Download progress" />
									{phaseLabel && (
										<div className="flex items-center justify-between text-xs text-muted-foreground">
											<span>Phase</span>
											<span className="text-foreground">{phaseLabel}</span>
										</div>
									)}
								</div>

								<dl className="grid gap-3 text-xs text-muted-foreground">
									<div className="flex items-center justify-between gap-2">
										<dt>Job ID</dt>
										<dd className="font-mono text-foreground">{cloudJobId ? `${cloudJobId.slice(0, 10)}...` : '—'}</dd>
									</div>
									<div className="flex items-center justify-between gap-2">
										<dt>Media ID</dt>
										<dd className="font-mono text-foreground">{cloudMediaId ? `${cloudMediaId.slice(0, 10)}...` : '—'}</dd>
									</div>
									<div className="flex items-center justify-between gap-2">
										<dt>Proxy</dt>
										<dd className="max-w-[70%] truncate text-foreground" title={renderProxyLabel(selectedProxyId)}>
											{renderProxyLabel(selectedProxyId)}
										</dd>
									</div>
									<div className="flex items-center justify-between gap-2">
										<dt>Auto retry</dt>
										<dd className="text-foreground">{rotationSummary}</dd>
									</div>
								</dl>

								{cloudStatusQuery.data?.message && (
									<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
										{cloudStatusQuery.data.message}
									</div>
								)}
							</CardContent>
							{rotationActive && (
								<CardFooter className="flex justify-end">
									<Button
										variant="secondary"
										size="sm"
										disabled={autoRetryStopped || isSubmitting}
										onClick={() => setAutoRetryStopped(true)}
									>
										Stop auto retry
									</Button>
								</CardFooter>
							)}
						</Card>

						<p className="text-xs text-muted-foreground">
							Jobs run up to two hours with a 2GB cap. Larger or protected media may take longer in the queue.
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
