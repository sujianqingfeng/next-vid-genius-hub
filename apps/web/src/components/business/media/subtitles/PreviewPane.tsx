'use client'

import { Film, Video } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_LABELS } from '~/lib/config/media-status'
import { useTranslations } from '~/lib/i18n'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { parseVttTimestamp } from '~/lib/subtitle/utils/time'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { VideoPreview } from './VideoPreview/VideoPreview'

interface PreviewPaneProps {
	mediaId: string
	translation?: string | null
	config: SubtitleRenderConfig
	hasRenderedVideo: boolean
	thumbnail?: string
	cacheBuster?: number
	// Rendering state hints
	isRendering?: boolean
	cloudStatus?: { status?: string; progress?: number } | null
	onDurationChange?: (duration: number) => void
	onCurrentTimeChange?: (time: number) => void
	onVideoRefChange?: (ref: HTMLVideoElement | null) => void
}

export function PreviewPane(props: PreviewPaneProps) {
	const t = useTranslations('Subtitles')
	const tJob = useTranslations('Common.cloudJobProgress')
	const {
		mediaId,
		translation,
		config,
		hasRenderedVideo,
		thumbnail,
		cacheBuster,
		isRendering,
		cloudStatus,
		onDurationChange,
		onCurrentTimeChange,
		onVideoRefChange,
	} = props

	const effectiveMode: 'overlay' | 'rendered' = hasRenderedVideo
		? 'rendered'
		: 'overlay'

	const renderedUrlBase = `/api/media/${mediaId}/rendered`
	const renderedSrc = cacheBuster
		? `${renderedUrlBase}?v=${cacheBuster}`
		: renderedUrlBase

	const statusLabel = useMemo(() => {
		const s = cloudStatus?.status
		if (!s) return isRendering ? t('render.starting') : null

		const translated = tJob(`status.${s}`)
		if (translated !== `Common.cloudJobProgress.status.${s}`) return translated

		return s in STATUS_LABELS
			? STATUS_LABELS[s as keyof typeof STATUS_LABELS]
			: s
	}, [cloudStatus?.status, isRendering, t, tJob])

	const progressPct =
		typeof cloudStatus?.progress === 'number'
			? Math.round((cloudStatus?.progress ?? 0) * 100)
			: undefined

	const cues = useMemo(
		() => (translation ? parseVttCues(translation) : []),
		[translation],
	)

	const renderedRef = useRef<HTMLVideoElement | null>(null)
	const overlayRef = useRef<HTMLVideoElement | null>(null)
	const [renderedVideoEl, setRenderedVideoEl] =
		useState<HTMLVideoElement | null>(null)
	const [overlayVideoEl, setOverlayVideoEl] = useState<HTMLVideoElement | null>(
		null,
	)

	const handleJump = (startTs: string) => {
		const t = parseVttTimestamp(startTs)
		const el =
			effectiveMode === 'rendered' ? renderedRef.current : overlayRef.current
		if (el && !Number.isNaN(t)) {
			el.currentTime = t
			// optional: auto play to provide immediate feedback
			el.play?.()
		}
	}

	useEffect(() => {
		if (effectiveMode === 'rendered') {
			onVideoRefChange?.(renderedVideoEl ?? null)
		} else {
			onVideoRefChange?.(overlayVideoEl ?? null)
		}
	}, [effectiveMode, onVideoRefChange, renderedVideoEl, overlayVideoEl])

	useEffect(() => {
		if (effectiveMode !== 'rendered' || !renderedVideoEl) return

		const handleTimeUpdate = () => {
			if (typeof renderedVideoEl.currentTime === 'number') {
				onCurrentTimeChange?.(renderedVideoEl.currentTime)
			}
		}

		const handleLoaded = () => {
			if (
				Number.isFinite(renderedVideoEl.duration) &&
				renderedVideoEl.duration > 0
			) {
				onDurationChange?.(renderedVideoEl.duration)
			}
		}

		renderedVideoEl.addEventListener('timeupdate', handleTimeUpdate)
		renderedVideoEl.addEventListener('loadedmetadata', handleLoaded)

		handleLoaded()

		return () => {
			renderedVideoEl.removeEventListener('timeupdate', handleTimeUpdate)
			renderedVideoEl.removeEventListener('loadedmetadata', handleLoaded)
		}
	}, [effectiveMode, renderedVideoEl, onCurrentTimeChange, onDurationChange])

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between border-b border-border pb-4">
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center h-6 w-6 border border-foreground bg-foreground text-background">
						<Video className="h-3 w-3" />
					</div>
					<h3 className="text-base font-bold uppercase tracking-wide">
						{t('ui.videoPreview.title')}
					</h3>
					{hasRenderedVideo && (
						<span className="ml-2 border border-border bg-secondary/20 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-foreground">
							{t('ui.videoPreview.badges.rendered')}
						</span>
					)}
				</div>
				{(isRendering || cloudStatus?.status) && (
					<div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase">
						<Film className="h-3 w-3" />
						<span>{statusLabel ?? t('render.starting')}</span>
						{typeof progressPct === 'number' && (
							<span className="tabular-nums border-l border-border pl-2 ml-1">
								{progressPct}%
							</span>
						)}
					</div>
				)}
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left: Video */}
				<div
					className="lg:col-span-2 w-full border border-border bg-black overflow-hidden"
					style={{ minHeight: '300px', maxHeight: '80vh' }}
				>
					{effectiveMode === 'rendered' ? (
						<video
							ref={(el) => {
								renderedRef.current = el
								setRenderedVideoEl(el)
								if (effectiveMode === 'rendered') {
									onVideoRefChange?.(el)
								}
							}}
							controls
							preload="metadata"
							className="w-full h-full object-contain"
							poster={thumbnail || undefined}
							crossOrigin="anonymous"
						>
							<source src={renderedSrc} type="video/mp4" />
							Your browser does not support the video tag.
						</video>
					) : (
						<VideoPreview
							mediaId={mediaId}
							translation={translation ?? undefined}
							config={config}
							isRendering={isRendering}
							onVideoRef={(ref) => {
								overlayRef.current = ref
								setOverlayVideoEl(ref)
								onVideoRefChange?.(ref)
							}}
							onTimeUpdate={onCurrentTimeChange}
							onDurationChange={onDurationChange}
						/>
					)}
				</div>

				{/* Right: Subtitle List */}
				<div className="flex flex-col border border-border bg-background max-h-[600px]">
					<div className="flex-shrink-0 px-4 py-3 border-b border-border bg-secondary/5 flex justify-between items-center">
						<h3 className="text-xs font-bold uppercase tracking-wide">
							Subtitles
						</h3>
						<span className="border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase bg-background">
							{cues.length} CUES
						</span>
					</div>
					<div className="flex-1 min-h-0 overflow-y-auto">
						{cues.length === 0 ? (
							<div className="flex items-center justify-center h-32 text-muted-foreground text-xs font-mono uppercase">
								{translation
									? 'No subtitles available'
									: 'Translation required'}
							</div>
						) : (
							<div className="divide-y divide-border">
								{cues.map((cue, idx) => (
									<div
										key={`${cue.start}-${cue.end}-${idx}`}
										className="px-4 py-3 text-xs hover:bg-secondary/5 transition-colors cursor-pointer group"
										onClick={() => handleJump(cue.start)}
									>
										<div className="text-muted-foreground font-mono text-[10px] mb-1 opacity-70 group-hover:opacity-100 group-hover:text-primary transition-all">
											{cue.start} → {cue.end}
										</div>
										<div className="space-y-0.5">
											{cue.lines.map((line, i) => (
												<div
													key={i}
													className="text-xs font-mono break-words leading-snug"
												>
													{line}
												</div>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
