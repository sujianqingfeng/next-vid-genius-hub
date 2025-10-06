'use client'

import { Download, FileText, Play, Video } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface Step4PreviewProps {
	mediaId: string
	hasRenderedVideo: boolean
	thumbnail?: string
	cacheBuster?: number
}

export function Step4Preview(props: Step4PreviewProps) {
	const { mediaId, hasRenderedVideo, thumbnail, cacheBuster } = props

	const baseRenderedUrl = `/api/media/${mediaId}/rendered`
	const baseSubtitlesUrl = `/api/media/${mediaId}/subtitles`
	const videoSrc = cacheBuster
		? `${baseRenderedUrl}?v=${cacheBuster}`
		: baseRenderedUrl
	const downloadVideoUrl = cacheBuster
		? `${baseRenderedUrl}?download=1&v=${cacheBuster}`
		: `${baseRenderedUrl}?download=1`
	const subtitlesDownloadUrl = cacheBuster
		? `${baseSubtitlesUrl}?v=${cacheBuster}`
		: baseSubtitlesUrl

	if (!hasRenderedVideo) {
		return (
			<div className="text-center py-8">
				<Video className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
				<h3 className="text-lg font-semibold mb-2">Rendering in Progress</h3>
				<p className="text-muted-foreground mb-4">
					Please wait while we process your video...
				</p>
				<div className="mx-auto h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Video Preview */}
			<div className="aspect-video bg-black rounded-lg overflow-hidden">
				<video
					key={cacheBuster ?? 0}
					controls
					preload="metadata"
					className="w-full h-full"
					poster={thumbnail || undefined}
					crossOrigin="anonymous"
				>
					<source src={videoSrc} type="video/mp4" />
					Your browser does not support the video tag.
				</video>
			</div>

			{/* Download Buttons */}
			<div className="flex flex-col sm:flex-row gap-3">
				<Button asChild className="flex-1">
					<a href={downloadVideoUrl}>
						<Video className="h-4 w-4 mr-2" />
						Download Video
					</a>
				</Button>
				<Button asChild variant="outline" className="flex-1">
					<a href={subtitlesDownloadUrl} download>
						<FileText className="h-4 w-4 mr-2" />
						Download Subtitles
					</a>
				</Button>
			</div>
		</div>
	)
}
