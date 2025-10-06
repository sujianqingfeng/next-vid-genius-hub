'use client'

import { useMutation } from '@tanstack/react-query'
import { Download, Link, Loader2, Video } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
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
			// 延迟一秒后返回上一页，让用户看到成功提示
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
		<div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
			<div className="px-4 py-8 max-w-2xl mx-auto">
				{/* Header Section */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
						<Download className="w-8 h-8 text-primary" />
					</div>
					<h1 className="text-4xl font-bold tracking-tight mb-2">
						New Download
					</h1>
					<p className="text-muted-foreground text-lg">
						Download videos from YouTube and TikTok with high quality
					</p>
				</div>

				{/* Main Form Card */}
				<Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
					<CardHeader className="text-center pb-4">
						<CardTitle className="flex items-center justify-center gap-2 text-xl">
							<Video className="w-5 h-5" />
							Download Configuration
						</CardTitle>
						<CardDescription>
							Enter the YouTube URL and select your preferred quality
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form action={formAction} className="space-y-6">
							{/* URL Input */}
							<div className="space-y-2">
								<Label htmlFor="download-url" className="text-sm font-medium">
									YouTube or TikTok URL
								</Label>
								<div className="relative">
									<Link className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
									<Input
										id="download-url"
										name="url"
										type="url"
										placeholder="https://www.youtube.com/watch?v=... or https://www.tiktok.com/@user/video/..."
										required
										disabled={downloadMutation.isPending}
										className="pl-10 h-12 text-base"
									/>
								</div>
							</div>

							{/* Quality Selection */}
							<div className="space-y-2">
								<Label htmlFor="quality" className="text-sm font-medium">
									Video Quality
								</Label>
								<Select
									name="quality"
									defaultValue="1080p"
									disabled={downloadMutation.isPending}
								>
									<SelectTrigger id="quality" className="h-12 text-base">
										<SelectValue placeholder="Select quality" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="1080p" className="text-base">
											<span className="flex items-center gap-2">
												<span className="w-2 h-2 bg-green-500 rounded-full"></span>
												1080p (Full HD)
											</span>
										</SelectItem>
										<SelectItem value="720p" className="text-base">
											<span className="flex items-center gap-2">
												<span className="w-2 h-2 bg-blue-500 rounded-full"></span>
												720p (HD)
											</span>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Error Display */}
							{error && (
								<div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-lg flex items-center gap-2">
									<div className="w-2 h-2 bg-destructive rounded-full"></div>
									{error}
								</div>
							)}

							{/* Submit Button */}
							<Button
								type="submit"
								disabled={downloadMutation.isPending}
								className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-200"
							>
								{downloadMutation.isPending ? (
									<>
										<Loader2 className="w-4 h-4 mr-2 animate-spin" />
										Starting Download...
									</>
								) : (
									<>
										<Download className="w-4 h-4 mr-2" />
										Start Download
									</>
								)}
							</Button>
						</form>
					</CardContent>
				</Card>

				{/* Help Text */}
				<div className="mt-8 text-center">
					<p className="text-sm text-muted-foreground">
						Supported formats: YouTube videos • Max duration: 2 hours • File
						size limit: 2GB
					</p>
				</div>
			</div>
		</div>
	)
}
