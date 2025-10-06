'use client'

import { CheckCircle, Download, FileText, Play, Video } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'

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
			<div className="text-center space-y-4">
				<div className="p-6 bg-muted/50 rounded-lg">
					<Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
					<h3 className="text-lg font-semibold mb-2">Rendering in Progress</h3>
					<p className="text-muted-foreground mb-4">
						Please wait for the rendering process to complete. This may take
						several minutes.
					</p>
					<div className="mx-auto h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<h3 className="text-lg font-semibold flex items-center gap-2">
					<Play className="h-5 w-5" />
					Video Preview
				</h3>
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
			</div>

			<div className="space-y-4">
				<h3 className="text-lg font-semibold flex items-center gap-2">
					<Download className="h-5 w-5" />
					Download Options
				</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<Video className="h-8 w-8 text-primary" />
								<div className="flex-1">
									<h4 className="font-semibold">Rendered Video</h4>
									<p className="text-sm text-muted-foreground">
										Video with embedded subtitles
									</p>
								</div>
								<Button asChild variant="outline" size="sm">
									<a href={downloadVideoUrl}>
										<Download className="h-4 w-4 mr-2" />
										Download
									</a>
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<FileText className="h-8 w-8 text-primary" />
								<div className="flex-1">
									<h4 className="font-semibold">Subtitles File</h4>
									<p className="text-sm text-muted-foreground">
										Bilingual subtitles (VTT)
									</p>
								</div>
								<Button asChild variant="outline" size="sm">
									<a href={subtitlesDownloadUrl} download>
										<Download className="h-4 w-4 mr-2" />
										Download
									</a>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
