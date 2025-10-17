'use client'

import { Download, Play, Video } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface Step4PreviewProps {
	mediaId: string
	hasRenderedVideo: boolean
	thumbnail?: string
	cacheBuster?: number
  showVideo?: boolean
}

export function Step4Preview(props: Step4PreviewProps) {
	const { mediaId, hasRenderedVideo, thumbnail, cacheBuster, showVideo = true } = props

	const baseRenderedUrl = `/api/media/${mediaId}/rendered`
	const videoSrc = cacheBuster
		? `${baseRenderedUrl}?v=${cacheBuster}`
		: baseRenderedUrl
	const downloadVideoUrl = cacheBuster
		? `${baseRenderedUrl}?download=1&v=${cacheBuster}`
		: `${baseRenderedUrl}?download=1`

	if (!hasRenderedVideo) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] text-center">
				<Video className="h-16 w-16 mb-4 text-muted-foreground" />
				<h3 className="text-xl font-semibold mb-2">Rendering in Progress</h3>
				<p className="text-muted-foreground mb-6 max-w-md">
					Please wait while we process your video with subtitles...
				</p>
				<div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
			{/* 左侧：视频预览区域（可隐藏） */}
			{showVideo && (
				<div className="flex-1 lg:max-w-2xl">
					<div className="space-y-3">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Play className="h-5 w-5" />
							Preview Video
						</h3>
						<div className="w-full bg-black rounded-lg overflow-hidden" style={{ minHeight: '300px', maxHeight: '80vh' }}>
              <video
                  controls
                  preload="metadata"
                  className="w-full h-full object-contain"
                  poster={thumbnail || undefined}
                  crossOrigin="anonymous"
							>
								<source src={videoSrc} type="video/mp4" />
								Your browser does not support the video tag.
							</video>
						</div>
					</div>
				</div>
			)}

			{/* 右侧：下载区域 */}
			<div className={showVideo ? 'flex-1 lg:max-w-xl' : 'w-full lg:max-w-2xl'}>
				<div className="space-y-4">
					{/* 下载标题 */}
					<h3 className="text-lg font-semibold flex items-center gap-2">
						<Download className="h-5 w-5" />
						Download Files
					</h3>

					{/* 下载按钮 */}
					<div className="space-y-3">
						{/* 主要下载按钮 */}
						<Button asChild className="w-full" size="lg">
							<a href={downloadVideoUrl}>
								<Video className="h-4 w-4 mr-2" />
								Download Video
							</a>
						</Button>

            {/* 移除字幕下载功能，根据需求不再提供 */}
					</div>
				</div>
			</div>
		</div>
	)
}
