'use client'

import { Download, Play, Video } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useTranslations } from '~/lib/i18n'

interface Step4PreviewProps {
	mediaId: string
	hasRenderedVideo: boolean
	thumbnail?: string
	cacheBuster?: number
	showVideo?: boolean
}

export function Step4Preview(props: Step4PreviewProps) {
	const t = useTranslations('Subtitles.ui.step4Preview')
	const {
		mediaId,
		hasRenderedVideo,
		thumbnail,
		cacheBuster,
		showVideo = true,
	} = props

	const baseRenderedUrl = `/api/media/${mediaId}/rendered`
	const videoSrc = cacheBuster
		? `${baseRenderedUrl}?v=${cacheBuster}`
		: baseRenderedUrl
	const downloadVideoUrl = cacheBuster
		? `${baseRenderedUrl}?download=1&v=${cacheBuster}`
		: `${baseRenderedUrl}?download=1`

	if (!hasRenderedVideo) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[320px] rounded-lg border bg-muted/20 p-8 text-center">
				<Video className="h-16 w-16 mb-4 text-muted-foreground" />
				<h3 className="text-xl font-semibold mb-2">{t('renderingTitle')}</h3>
				<p className="text-muted-foreground mb-6 max-w-md">
					{t('renderingBody')}
				</p>
				<div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
			</div>
		)
	}

	const wrapperClass = showVideo
		? 'grid gap-6 md:grid-cols-2 lg:gap-8'
		: 'grid gap-6'

	return (
		<div className={wrapperClass}>
			{showVideo && (
				<div className="w-full">
					<div className="space-y-3">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Play className="h-5 w-5" />
							{t('previewTitle')}
						</h3>
						<div
							className="w-full bg-black rounded-lg overflow-hidden"
							style={{ minHeight: '300px', maxHeight: '80vh' }}
						>
							<video
								controls
								preload="metadata"
								className="w-full h-full object-contain"
								poster={thumbnail || undefined}
								crossOrigin="anonymous"
							>
								<source src={videoSrc} type="video/mp4" />
								{t('videoUnsupported')}
							</video>
						</div>
					</div>
				</div>
			)}

			<div className="w-full">
				<div className="space-y-4">
					<h3 className="text-lg font-semibold flex items-center gap-2">
						<Download className="h-5 w-5" />
						{t('downloadTitle')}
					</h3>

					<div className="space-y-3">
						<Button asChild className="w-full h-11" size="lg">
							<a href={downloadVideoUrl}>
								<Video className="h-4 w-4 mr-2" />
								{t('downloadVideo')}
							</a>
						</Button>

						{/* 移除字幕下载功能，根据需求不再提供 */}
					</div>
				</div>
			</div>
		</div>
	)
}
