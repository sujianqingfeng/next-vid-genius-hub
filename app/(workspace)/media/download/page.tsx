'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
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

	const downloadMutation = useMutation({
		...queryOrpc.download.mutationOptions(),
		onSuccess: () => {
			toast.success('Download started successfully!')
			setError(null)
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
		<div className="container mx-auto py-8">
			<h1 className="text-3xl font-bold mb-6">New Download</h1>
			<div className="rounded-lg shadow-md p-6 bg-card">
				<p className="text-muted-foreground mb-4">
					Add a new download task here
				</p>
				<form action={formAction} className="space-y-4 max-w-xl">
					<div className="grid gap-2">
						<Label htmlFor="download-url">Download URL</Label>
						<Input
							id="download-url"
							name="url"
							type="url"
							placeholder="Enter YouTube URL"
							required
							disabled={downloadMutation.isPending}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="quality">Quality</Label>
						<Select
							name="quality"
							defaultValue="1080p"
							disabled={downloadMutation.isPending}
						>
							<SelectTrigger id="quality">
								<SelectValue placeholder="Select quality" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1080p">1080p</SelectItem>
								<SelectItem value="720p">720p</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{error && (
						<div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
							{error}
						</div>
					)}
					<Button type="submit" disabled={downloadMutation.isPending}>
						{downloadMutation.isPending ? 'Starting...' : 'Start Download'}
					</Button>
				</form>
			</div>
		</div>
	)
}
