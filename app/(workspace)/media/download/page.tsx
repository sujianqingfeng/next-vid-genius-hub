'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Link, Loader2, Cloud, HardDrive } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
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
	const [backend, setBackend] = useState<'local' | 'cloud'>('cloud')
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
	
	const router = useRouter()

	const downloadMutation = useMutation({
		...queryOrpc.download.download.mutationOptions(),
			onSuccess: () => {
			toast.success('Download started successfully!')
			setError(null)
			// 本地下载成功后清空 URL，再返回上一页
			setUrlValue('')
			setTimeout(() => {
				router.back()
			}, 1000)
			},
		onError: (err: Error) => {
			console.error(err)
			setError(err.message || 'Failed to start download')
		},
	})

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
		enabled: backend === 'cloud' && !!cloudJobId,
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
	const isSubmitting = downloadMutation.isPending || cloudDownloadMutation.isPending

	const formAction = async (formData: FormData) => {
		const url = (urlValue || (formData.get('url') as string) || '').trim()
		const quality = formData.get('quality') as '1080p' | '720p'

		if (!url) {
			setError('Please enter a valid URL')
			return
		}

		setError(null)
		setLastInput({ url, quality })
		setAutoRetryStopped(false)
		// prepare rotation queue for cloud mode
		if (backend === 'cloud') {
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
		} else {
			downloadMutation.mutate({
				url,
				quality,
				proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId,
			})
		}
	}

	useEffect(() => {
		const status = cloudStatusQuery.data?.status
		if (!status || !cloudJobId) return
		if (status === lastCloudStatus) return
		setLastCloudStatus(status)

		if (status === 'completed') {
			toast.success('Cloud download completed!')
			// 云端下载成功后清空 URL
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
				backend === 'cloud' &&
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
	}, [backend, autoRotate, autoRetryStopped, attempt, maxAttempts, rotationQueue, cloudStatusQuery.data?.status, cloudStatusQuery.data?.message, cloudJobId, lastCloudStatus, cloudDownloadMutation, lastInput])

	return (
		<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
			<div className="w-full max-w-lg">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-4">
						<Download className="w-8 h-8 text-primary" />
					</div>
					<h1 className="text-3xl font-bold mb-2">Download Video</h1>
					<p className="text-muted-foreground">
						YouTube and TikTok videos
					</p>
				</div>

				{/* Main Card */}
				<div className="bg-card border rounded-2xl shadow-sm p-6 space-y-6">
					{/* Backend Selection */}
					<div className="flex gap-2 p-1 bg-muted rounded-lg">
						<Button
							type="button"
							variant={backend === 'cloud' ? 'default' : 'ghost'}
							size="sm"
							onClick={() => setBackend('cloud')}
							className="flex-1 gap-2"
						>
							<Cloud className="w-4 h-4" />
							Cloud
						</Button>
						<Button
							type="button"
							variant={backend === 'local' ? 'default' : 'ghost'}
							size="sm"
							onClick={() => setBackend('local')}
							className="flex-1 gap-2"
						>
							<HardDrive className="w-4 h-4" />
							Local
						</Button>
					</div>

					{/* Form */}
					<form action={formAction} className="space-y-4">
						{/* URL Input */}
			<div>
							<label htmlFor="url" className="text-sm font-medium mb-2 block">
								Video URL
							</label>
							<div className="relative">
								<Link className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
								<Input
									id="url"
									name="url"
									type="url"
									placeholder="https://youtube.com/watch?v=..."
									required
									disabled={isSubmitting}
									value={urlValue}
									onChange={(e) => setUrlValue(e.target.value)}
									className="pl-10 h-12"
								/>
							</div>
						</div>

						{/* Quality Selection */}
						<div>
							<label htmlFor="quality" className="text-sm font-medium mb-2 block">
								Quality
							</label>
							<Select
								name="quality"
								defaultValue="1080p"
								disabled={isSubmitting}
							>
								<SelectTrigger className="h-10">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1080p">1080p</SelectItem>
									<SelectItem value="720p">720p</SelectItem>
								</SelectContent>
							</Select>
						</div>

					{/* Proxy Selection */}
						<ProxySelector
							value={selectedProxyId}
							onValueChange={setSelectedProxyId}
							disabled={isSubmitting}
						/>

						{/* Auto Rotate (Cloud only) */}
						<div className="space-y-2 border rounded-lg p-3">
							<div className="flex items-center justify-between">
								<div className="flex flex-col">
									<span className="text-sm font-medium">自动切换代理（仅云端）</span>
									<span className="text-xs text-muted-foreground">下载失败后自动尝试下一个代理</span>
								</div>
								<Switch
									checked={autoRotate}
									onCheckedChange={(v) => setAutoRotate(Boolean(v))}
									disabled={isSubmitting}
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="text-sm font-medium mb-2 block">最大尝试次数</label>
									<Input
										type="number"
										min={1}
										max={50}
										value={maxAttempts}
										onChange={(e) => setMaxAttempts(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
										disabled={isSubmitting || !autoRotate}
										className="h-10"
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-2 block">轮换顺序</label>
									<Select
										value={rotationScope}
										onValueChange={(v) => setRotationScope((v as 'selectedFirst' | 'all') || 'selectedFirst')}
										disabled={isSubmitting || !autoRotate}
									>
										<SelectTrigger className="h-10">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="selectedFirst">已选优先</SelectItem>
											<SelectItem value="all">全部</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>

						{/* Error */}
						{error && (
							<div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
								{error}
							</div>
						)}

						{/* Submit Button */}
						<Button
							type="submit"
							disabled={isSubmitting}
							className="w-full h-12 text-base font-medium"
						>
							{isSubmitting ? (
								<>
									<Loader2 className="w-5 h-5 mr-2 animate-spin" />
									{backend === 'cloud' ? 'Queueing...' : 'Downloading...'}
								</>
							) : (
								<>
									<Download className="w-5 h-5 mr-2" />
									{backend === 'cloud' ? 'Start Cloud Download' : 'Download'}
								</>
							)}
						</Button>
					</form>

					{/* Cloud Status */}
					{backend === 'cloud' && cloudJobId && (
						<div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
							<div className="font-medium flex items-center gap-2">
								<Cloud className="w-4 h-4" />
								Cloud Download Status
							</div>
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div>
									<span className="text-muted-foreground">Job ID:</span>
									<span className="ml-1 font-mono">{cloudJobId.slice(0, 8)}...</span>
								</div>
								{cloudMediaId && (
									<div>
										<span className="text-muted-foreground">Media ID:</span>
										<span className="ml-1 font-mono">{cloudMediaId.slice(0, 8)}...</span>
									</div>
								)}
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Status:</span>
								<span className="font-medium">
									{cloudStatusQuery.isLoading
										? 'Loading...'
										: statusLabel ?? cloudStatusQuery.data?.status ?? 'queued'}
									{typeof cloudStatusQuery.data?.progress === 'number'
										? ` (${Math.round(cloudStatusQuery.data.progress * 100)}%)`
										: ''}
								</span>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Proxy:</span>
								<span className="truncate max-w-[70%]" title={renderProxyLabel(selectedProxyId)}>
									{renderProxyLabel(selectedProxyId)}
								</span>
							</div>
							{autoRotate && (
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">自动重试:</span>
									<span>
										尝试 {Math.min(attempt, maxAttempts)} / {maxAttempts}
									</span>
								</div>
							)}
							{phaseLabel && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Phase:</span>
									<span>{phaseLabel}</span>
								</div>
							)}
							{cloudStatusQuery.data?.message && (
								<div className="text-destructive text-xs mt-2">
									{cloudStatusQuery.data.message}
								</div>
							)}
							{autoRotate && (
								<div className="pt-2">
									<Button
										variant="secondary"
										size="sm"
										disabled={autoRetryStopped || isSubmitting}
										onClick={() => setAutoRetryStopped(true)}
									>
										停止自动重试
									</Button>
								</div>
							)}
						</div>
					)}

					{/* Help Text */}
					<p className="text-xs text-muted-foreground text-center">
						Max duration: 2 hours • File size: 2GB
					</p>
				</div>
			</div>
		</div>
	)
}
