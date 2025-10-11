'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Link, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { queryOrpc } from '~/lib/orpc/query-client'
import { orpc } from '~/lib/orpc/client'

export default function NewDownloadPage() {
	const [error, setError] = useState<string | null>(null)
	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [backend, setBackend] = useState<'local' | 'cloud'>('cloud')
	const [cloudJobId, setCloudJobId] = useState<string | null>(null)
	const [cloudMediaId, setCloudMediaId] = useState<string | null>(null)
	const [lastCloudStatus, setLastCloudStatus] = useState<string | null>(null)
	const router = useRouter()

	const downloadMutation = useMutation({
		...queryOrpc.download.download.mutationOptions(),
		onSuccess: () => {
			toast.success('Download started successfully!')
			setError(null)
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
		refetchInterval: (data) => {
			if (!data) return 5000
			return ['completed', 'failed', 'canceled'].includes(data.status) ? false : 5000
		},
	})

	const statusLabelMap: Record<string, string> = {
		queued: 'Queued',
		fetching_metadata: 'Fetching metadata',
		preparing: 'Preparing',
		running: 'Running',
		uploading: 'Uploading',
		completed: 'Completed',
		failed: 'Failed',
		canceled: 'Canceled',
	}

	const phaseLabelMap: Record<string, string> = {
		fetching_metadata: 'Fetching metadata',
		preparing: 'Preparing',
		running: 'Processing',
		uploading: 'Uploading artifacts',
	}

	const statusLabel = cloudStatusQuery.data?.status
		? statusLabelMap[cloudStatusQuery.data.status] ?? cloudStatusQuery.data.status
		: null
	const phaseLabel = cloudStatusQuery.data?.phase
		? phaseLabelMap[cloudStatusQuery.data.phase] ?? cloudStatusQuery.data.phase
		: null
	const outputs = cloudStatusQuery.data?.outputs

	const isSubmitting = downloadMutation.isPending || cloudDownloadMutation.isPending

	const formAction = async (formData: FormData) => {
		const url = formData.get('url') as string
		const quality = formData.get('quality') as '1080p' | '720p'

		if (!url) {
			setError('Please enter a valid URL')
			return
		}

		setError(null)
		if (backend === 'cloud') {
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
		if (!cloudStatusQuery.data?.status || !cloudJobId) return
		if (cloudStatusQuery.data.status === lastCloudStatus) return
		setLastCloudStatus(cloudStatusQuery.data.status)

		if (cloudStatusQuery.data.status === 'completed') {
			toast.success('Cloud download completed!')
		}
		if (cloudStatusQuery.data.status === 'failed') {
			toast.error(cloudStatusQuery.data.message || 'Cloud download failed.')
			setError(cloudStatusQuery.data.message || 'Cloud download failed.')
		}
		if (cloudStatusQuery.data.status === 'canceled') {
			toast.warning('Cloud download was canceled.')
		}
	}, [cloudStatusQuery.data?.status, cloudStatusQuery.data?.message, cloudJobId, lastCloudStatus])

	return (
		<div className="flex items-center justify-center min-h-screen bg-background p-4">
			<div className="w-full max-w-md space-y-8">
				{/* Header */}
				<div className="text-center space-y-2">
					<div className="inline-flex items-center justify-center w-12 h-12 bg-primary rounded-full mb-4">
						<Download className="w-6 h-6 text-primary-foreground" />
					</div>
					<h1 className="text-2xl font-semibold">Download Video</h1>
					<p className="text-sm text-muted-foreground">
						YouTube and TikTok videos
					</p>
				</div>

				{/* Backend Selection */}
				<div className="flex items-center justify-center gap-3">
					<span className="text-sm text-muted-foreground">Backend:</span>
					<div className="inline-flex rounded-md border bg-muted p-1">
						<Button
							type="button"
							variant={backend === 'cloud' ? 'default' : 'ghost'}
							size="sm"
							onClick={() => setBackend('cloud')}
							className="px-4"
						>
							Cloud
						</Button>
						<Button
							type="button"
							variant={backend === 'local' ? 'default' : 'ghost'}
							size="sm"
							onClick={() => setBackend('local')}
							className="px-4"
						>
							Local
						</Button>
					</div>
				</div>

				{/* Form */}
				<form action={formAction} className="space-y-6">
					{/* URL Input */}
					<div className="space-y-2">
						<label htmlFor="url" className="text-sm font-medium">
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
								className="pl-10"
							/>
						</div>
					</div>

					{/* Quality Selection */}
					<div className="space-y-2">
						<label htmlFor="quality" className="text-sm font-medium">
							Quality
						</label>
						<Select
							name="quality"
							defaultValue="1080p"
							disabled={isSubmitting}
						>
							<SelectTrigger>
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

					{/* Error */}
					{error && (
						<div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
							{error}
						</div>
					)}

					{/* Submit Button */}
					<Button
						type="submit"
						disabled={isSubmitting}
						className="w-full"
					>
						{isSubmitting ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								{backend === 'cloud' ? 'Queueing...' : 'Downloading...'}
							</>
						) : (
							<>
								<Download className="w-4 h-4 mr-2" />
								{backend === 'cloud' ? 'Start Cloud Download' : 'Download'}
							</>
						)}
					</Button>
				</form>

				{/* Cloud status */}
				{backend === 'cloud' && cloudJobId && (
					<div className="rounded-md border border-border/40 bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
					<div className="font-medium text-foreground">Cloud job in progress</div>
					<div>Job ID: {cloudJobId}</div>
					{cloudMediaId && <div>Media ID: {cloudMediaId}</div>}
					<div>
						Status:{' '}
						{cloudStatusQuery.isLoading
							? 'Loading...'
							: statusLabel ?? cloudStatusQuery.data?.status ?? 'queued'}
						{typeof cloudStatusQuery.data?.progress === 'number'
							? ` (${Math.round(cloudStatusQuery.data.progress * 100)}%)`
							: ''}
					</div>
					{phaseLabel && <div>Phase: {phaseLabel}</div>}
					{outputs?.video?.key && (
						<div>
							Video key: <code className="break-all text-xs">{outputs.video.key}</code>
						</div>
					)}
					{outputs?.audio?.key && (
						<div>
							Audio key: <code className="break-all text-xs">{outputs.audio.key}</code>
						</div>
					)}
					{outputs?.metadata?.key && (
						<div>
							Metadata key: <code className="break-all text-xs">{outputs.metadata.key}</code>
						</div>
					)}
					{outputs?.metadata?.key && (
						<div className="text-xs text-emerald-600">
							Raw metadata has been uploaded via the cloud proxy and is ready for downstream steps.
						</div>
					)}
					{cloudStatusQuery.data?.message && (
						<div className="text-destructive">
							{cloudStatusQuery.data.message}
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
	)
}
