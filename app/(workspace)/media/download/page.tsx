'use client'

import { useMutation } from '@tanstack/react-query'
import { Download, Link, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function NewDownloadPage() {
	const [error, setError] = useState<string | null>(null)
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

	const formAction = async (formData: FormData) => {
		const url = formData.get('url') as string
		const quality = formData.get('quality') as '1080p' | '720p'

		if (!url) {
			setError('Please enter a valid URL')
			return
		}

		setError(null)
		downloadMutation.mutate({ url, quality })
	}

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
								disabled={downloadMutation.isPending}
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
							disabled={downloadMutation.isPending}
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

					{/* Error */}
					{error && (
						<div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
							{error}
						</div>
					)}

					{/* Submit Button */}
					<Button
						type="submit"
						disabled={downloadMutation.isPending}
						className="w-full"
					>
						{downloadMutation.isPending ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Downloading...
							</>
						) : (
							<>
								<Download className="w-4 h-4 mr-2" />
								Download
							</>
						)}
					</Button>
				</form>

				{/* Help Text */}
				<p className="text-xs text-muted-foreground text-center">
					Max duration: 2 hours • File size: 2GB
				</p>
			</div>
		</div>
	)
}
