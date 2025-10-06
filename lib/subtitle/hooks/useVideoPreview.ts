/**
 * 视频预览 Hook
 * 管理视频预览相关的状态和逻辑
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { VttCue } from '~/lib/subtitle/utils/vtt'
import { findActiveCue } from '~/lib/subtitle/utils/vtt'
import { UI_CONSTANTS } from '~/lib/subtitle/config/constants'

interface UseVideoPreviewOptions {
	mediaId: string
	cues: VttCue[]
	isDisabled?: boolean
	onTimeUpdate?: (currentTime: number) => void
}

interface VideoState {
	currentTime: number
	duration: number
	isPlaying: boolean
	containerHeight: number
	activeCue: VttCue | null
}

/**
 * 视频预览管理 Hook
 */
export function useVideoPreview({
	mediaId,
	cues,
	isDisabled = false,
	onTimeUpdate
}: UseVideoPreviewOptions) {
	const videoRef = useRef<HTMLVideoElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	const [videoState, setVideoState] = useState<VideoState>({
		currentTime: 0,
		duration: 0,
		isPlaying: false,
		containerHeight: 0,
		activeCue: null,
	})

	// 更新当前时间和活动字幕
	const updateTime = useCallback((time: number) => {
		const activeCue = cues.length > 0 ? findActiveCue(cues, time) : null

		setVideoState(prev => ({
			...prev,
			currentTime: time,
			activeCue
		}))

		onTimeUpdate?.(time)
	}, [cues, onTimeUpdate])

	// 视频时间更新处理
	const handleTimeUpdate = useCallback(() => {
		if (videoRef.current) {
			updateTime(videoRef.current.currentTime)
		}
	}, [updateTime])

	// 视频元数据加载完成处理
	const handleLoadedMetadata = useCallback(() => {
		if (videoRef.current) {
			const duration = videoRef.current.duration
			setVideoState(prev => ({
				...prev,
				duration
			}))
			updateTime(videoRef.current.currentTime)
		}
	}, [updateTime])

	// 视频搜索完成处理
	const handleSeeked = useCallback(() => {
		if (videoRef.current) {
			updateTime(videoRef.current.currentTime)
		}
	}, [updateTime])

	// 播放状态变化处理
	const handlePlay = useCallback(() => {
		setVideoState(prev => ({ ...prev, isPlaying: true }))
	}, [])

	const handlePause = useCallback(() => {
		setVideoState(prev => ({ ...prev, isPlaying: false }))
	}, [])

	// 设置视频事件监听器
	useEffect(() => {
		const video = videoRef.current
		if (!video || isDisabled) return

		video.addEventListener('timeupdate', handleTimeUpdate)
		video.addEventListener('loadedmetadata', handleLoadedMetadata)
		video.addEventListener('seeked', handleSeeked)
		video.addEventListener('play', handlePlay)
		video.addEventListener('pause', handlePause)

		return () => {
			video.removeEventListener('timeupdate', handleTimeUpdate)
			video.removeEventListener('loadedmetadata', handleLoadedMetadata)
			video.removeEventListener('seeked', handleSeeked)
			video.removeEventListener('play', handlePlay)
			video.removeEventListener('pause', handlePause)
		}
	}, [handleTimeUpdate, handleLoadedMetadata, handleSeeked, handlePlay, handlePause, isDisabled])

	// 监听容器尺寸变化
	useEffect(() => {
		const container = containerRef.current
		if (!container || typeof ResizeObserver === 'undefined') return

		const updateHeight = () => {
			const height = container.getBoundingClientRect().height
			setVideoState(prev => ({ ...prev, containerHeight: height }))
		}

		updateHeight()

		const observer = new ResizeObserver(updateHeight)
		observer.observe(container)

		return () => {
			observer.disconnect()
		}
	}, [])

	// 播放/暂停控制
	const togglePlayPause = useCallback(() => {
		if (!videoRef.current || isDisabled) return

		if (videoState.isPlaying) {
			videoRef.current.pause()
		} else {
			videoRef.current.play()
		}
	}, [videoState.isPlaying, isDisabled])

	// 跳转到指定时间
	const seekTo = useCallback((time: number) => {
		if (!videoRef.current || isDisabled) return

		const clampedTime = Math.max(0, Math.min(time, videoState.duration))
		videoRef.current.currentTime = clampedTime
	}, [videoState.duration, isDisabled])

	// 快进/快退
	const skipForward = useCallback((seconds: number = 10) => {
		seekTo(videoState.currentTime + seconds)
	}, [videoState.currentTime, seekTo])

	const skipBackward = useCallback((seconds: number = 10) => {
		seekTo(videoState.currentTime - seconds)
	}, [videoState.currentTime, seekTo])

	// 计算相对字体大小
	const calculateRelativeFontSize = useCallback((baseFontSize: number) => {
		if (videoState.containerHeight === 0) return baseFontSize

		const scaleFactor = videoState.containerHeight / UI_CONSTANTS.CONTAINER_HEIGHT_REFERENCE
		const scaledSize = baseFontSize * scaleFactor

		return Math.max(scaledSize, UI_CONSTANTS.MIN_CHINESE_FONT_SIZE)
	}, [videoState.containerHeight])

	// 格式化时间显示
	const formatTime = useCallback((seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}, [])

	return {
		// refs
		videoRef,
		containerRef,

		// state
		currentTime: videoState.currentTime,
		duration: videoState.duration,
		isPlaying: videoState.isPlaying,
		containerHeight: videoState.containerHeight,
		activeCue: videoState.activeCue,

		// controls
		togglePlayPause,
		seekTo,
		skipForward,
		skipBackward,

		// utilities
		calculateRelativeFontSize,
		formatTime,

		// computed
		progress: videoState.duration > 0 ? videoState.currentTime / videoState.duration : 0,
		isDisabled,
		mediaId,
	}
}