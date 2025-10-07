'use client'

import { useEffect, type ReactNode } from 'react'
import { Video, VideoOff, Loader2 } from 'lucide-react'
import { useVideoPreview } from '~/lib/subtitle/hooks'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { hexToRgba } from '~/lib/subtitle/utils/color'
import { UI_CONSTANTS } from '~/lib/subtitle/config/constants'
import type { SubtitleRenderConfig, VttCue } from '~/lib/subtitle/types'
import { SubtitleOverlay } from '../SubtitleOverlay'
import { HintTextOverlay } from '../HintTextOverlay'

interface VideoPreviewProps {
	mediaId: string
	translation?: string | null
	config: SubtitleRenderConfig
	isRendering?: boolean
	isDisabled?: boolean
	onTimeUpdate?: (currentTime: number) => void
	onDurationChange?: (duration: number) => void
	onVideoRef?: (ref: HTMLVideoElement | null) => void
}

interface PreviewMessageProps {
	children: ReactNode
}

/**
 * 预览消息组件
 */
function PreviewMessage({ children }: PreviewMessageProps) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 text-center text-sm text-muted-foreground">
			{children}
		</div>
	)
}

/**
 * 视频预览组件
 */
export function VideoPreview({
	mediaId,
	translation,
	config,
	isRendering = false,
	isDisabled = false,
	onTimeUpdate,
	onDurationChange,
	onVideoRef
}: VideoPreviewProps) {
	const cues = translation ? parseVttCues(translation) : []

	const {
		videoRef,
		containerRef,
		currentTime,
		activeCue,
		containerHeight,
		togglePlayPause,
		seekTo,
		formatTime,
		calculateRelativeFontSize,
		isPlaying,
		duration,
		progress,
	} = useVideoPreview({
		mediaId,
		cues,
		isDisabled: isRendering,
		onTimeUpdate,
	})

	// 通知父组件视频时长变化
	useEffect(() => {
		if (duration > 0) {
			onDurationChange?.(duration)
		}
	}, [duration, onDurationChange])

	// 通知父组件视频元素引用
	useEffect(() => {
		onVideoRef?.(videoRef.current)
	}, [onVideoRef])

	// 计算当前时间的效果
	const currentTimeEffect = config.timeSegmentEffects?.find(effect =>
		currentTime >= effect.startTime && currentTime <= effect.endTime
	)

	// 应用实时效果
	useEffect(() => {
		if (videoRef.current) {
			videoRef.current.muted = currentTimeEffect?.muteAudio ?? false
		}
	}, [currentTimeEffect])

	// 预览样式
	const previewStyle = {
		'--subtitle-font-size': `${config.fontSize}px`,
		'--subtitle-text-color': config.textColor,
		'--subtitle-bg-color': hexToRgba(config.backgroundColor, config.backgroundOpacity),
		'--subtitle-outline-color': hexToRgba(config.outlineColor, 0.9),
	} as React.CSSProperties

	// 检查是否应该显示预览
	const shouldShowPreview = !isRendering && translation && cues.length > 0

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold flex items-center gap-2">
				<Video className="h-5 w-5" />
				Video Preview
			</h3>

			<div
				ref={containerRef}
				className="subtitle-preview relative aspect-video overflow-hidden rounded-lg border bg-black"
				style={previewStyle}
			>
				<video
					ref={videoRef}
					className="h-full w-full object-contain"
					controls
					preload="metadata"
					crossOrigin="anonymous"
					disabled={isDisabled}
				>
					<source src={`/api/media/${mediaId}/source`} type="video/mp4" />
					Your browser does not support the video tag.
				</video>

				{/* 预览状态消息 */}
				{isRendering ? (
					<PreviewMessage>
						<VideoOff className="h-8 w-8" />
						<span>Preview disabled during rendering</span>
					</PreviewMessage>
				) : !translation ? (
					<PreviewMessage>
						<VideoOff className="h-8 w-8" />
						<span>Translation required for preview</span>
					</PreviewMessage>
				) : cues.length === 0 ? (
					<PreviewMessage>
						<VideoOff className="h-8 w-8" />
						<span>No subtitles found</span>
					</PreviewMessage>
				) : null}

				{/* 实时效果和字幕覆盖层 */}
				{shouldShowPreview && (
					<>
						{/* 黑屏效果 */}
						{currentTimeEffect?.blackScreen && (
							<div className="absolute inset-0 z-10 bg-black" />
						)}

						{/* 提示文本覆盖层 */}
						{currentTimeEffect?.blackScreen && config.hintTextConfig?.enabled && (
							<HintTextOverlay
								config={config.hintTextConfig}
								containerHeight={containerHeight}
							/>
						)}

						{/* 字幕覆盖层 */}
						<SubtitleOverlay
							cue={activeCue}
							config={config}
							containerHeight={containerHeight}
						/>
					</>
				)}

				{/* 自定义CSS样式 */}
				<style
					dangerouslySetInnerHTML={{
						__html: `
							.subtitle-preview video::cue {
								font-size: var(--subtitle-font-size, 34px);
								color: var(--subtitle-text-color, #ffffff);
								background-color: var(--subtitle-bg-color, rgba(0,0,0,0.65));
								text-shadow: 0 0 6px var(--subtitle-outline-color, rgba(0,0,0,0.9));
								line-height: 1.35;
								padding: 0.4em 0.6em;
								border-radius: 0.4em;
							}
						`,
					}}
				/>
			</div>

			{/* 视频控制信息 */}
			{shouldShowPreview && (
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<span>{formatTime(currentTime)}</span>
					<span>{formatTime(duration)}</span>
				</div>
			)}
		</div>
	)
}