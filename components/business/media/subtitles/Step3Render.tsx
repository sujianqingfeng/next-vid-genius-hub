'use client'

import {
	type ChangeEvent,
	type CSSProperties,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import {
	AlertCircle,
	Loader2,
	SlidersHorizontal,
	Video,
	VideoOff,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	subtitleRenderPresets,
	type SubtitleRenderConfig,
	type SubtitleRenderPreset,
} from '~/lib/media/types'
import { parseVttCues, type VttCue } from '~/lib/media/utils/vtt'

const DEFAULT_PRESET_ID: SubtitleRenderPreset['id'] = 'default'
const DEFAULT_PRESET = (
	subtitleRenderPresets.find((preset) => preset.id === DEFAULT_PRESET_ID) ??
	subtitleRenderPresets[0]
) as SubtitleRenderPreset

type PresetId = SubtitleRenderPreset['id'] | 'custom'

interface Step3RenderProps {
	isRendering: boolean
	onStart: (config: SubtitleRenderConfig) => void
	errorMessage?: string
	mediaId: string
	translationAvailable: boolean
	translation?: string | null
	config: SubtitleRenderConfig
	onConfigChange: (config: SubtitleRenderConfig) => void
}

export function Step3Render(props: Step3RenderProps) {
	const {
		isRendering,
		onStart,
		errorMessage,
		mediaId,
		translationAvailable,
		translation,
		config,
		onConfigChange,
	} = props

	const [selectedPresetId, setSelectedPresetId] = useState<PresetId>(() => {
		const matching = subtitleRenderPresets.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		return matching?.id ?? 'custom'
	})

	useEffect(() => {
		const matching = subtitleRenderPresets.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		const nextId: PresetId = matching?.id ?? 'custom'
		setSelectedPresetId((prev) => (prev === nextId ? prev : nextId))
	}, [config])

	const selectedPreset = useMemo(() => {
		if (selectedPresetId === 'custom') return undefined
		return subtitleRenderPresets.find((preset) => preset.id === selectedPresetId)
	}, [selectedPresetId])

	const cues = useMemo(() => {
		if (!translation) return []
		return parseVttCues(translation)
	}, [translation])

	const videoRef = useRef<HTMLVideoElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const [containerHeight, setContainerHeight] = useState(0)
	const [currentTime, setCurrentTime] = useState(0)

	useEffect(() => {
		const video = videoRef.current
		if (!video) return

		const handleTimeUpdate = () => {
			setCurrentTime(video.currentTime)
		}

		video.addEventListener('timeupdate', handleTimeUpdate)
		video.addEventListener('seeked', handleTimeUpdate)
		video.addEventListener('loadedmetadata', handleTimeUpdate)

		return () => {
			video.removeEventListener('timeupdate', handleTimeUpdate)
			video.removeEventListener('seeked', handleTimeUpdate)
			video.removeEventListener('loadedmetadata', handleTimeUpdate)
		}
	}, [cues])

	useEffect(() => {
		const container = containerRef.current
		if (!container || typeof ResizeObserver === 'undefined') return

		const updateHeight = () => {
			setContainerHeight(container.getBoundingClientRect().height)
		}

		updateHeight()

		const observer = new ResizeObserver(updateHeight)
		observer.observe(container)

		return () => {
			observer.disconnect()
		}
	}, [])

	const activeCue = useMemo(() => {
		if (!cues.length) return null
		const time = currentTime
		for (const cue of cues) {
			const start = parseVttTimestamp(cue.start)
			const end = parseVttTimestamp(cue.end)
			if (time >= start && time <= end) {
				return cue
			}
		}
		return null
	}, [cues, currentTime])

	const previewStyle = useMemo(() => {
		return {
			'--subtitle-font-size': `${config.fontSize}px`,
			'--subtitle-text-color': config.textColor,
			'--subtitle-bg-color': hexToRgba(config.backgroundColor, config.backgroundOpacity),
			'--subtitle-outline-color': hexToRgba(config.outlineColor, 0.9),
		} as CSSProperties
	}, [config])

	const handlePresetClick = (preset: SubtitleRenderPreset) => {
		setSelectedPresetId(preset.id)
		onConfigChange({ ...preset.config })
	}

	const handleNumericChange = (field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.target.value)
			if (Number.isNaN(value)) return
			const clamped = Math.min(Math.max(value, 12), 72)
			onConfigChange({ ...config, [field]: clamped })
		}

	const handleOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
		const value = Number(event.target.value) / 100
		if (Number.isNaN(value)) return
		onConfigChange({ ...config, backgroundOpacity: Math.min(Math.max(value, 0), 1) })
	}

	const handleColorChange = (field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			onConfigChange({ ...config, [field]: event.target.value })
		}

	return (
		<div className="space-y-6">
			{/* Preview Area */}
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
					>
						<source src={`/api/media/${mediaId}/source`} type="video/mp4" />
						Your browser does not support the video tag.
					</video>

					{isRendering ? (
						<PreviewMessage>
							<VideoOff className="h-8 w-8" />
							<span>Preview disabled during rendering</span>
						</PreviewMessage>
					) : !translationAvailable || !translation ? (
						<PreviewMessage>
							<VideoOff className="h-8 w-8" />
							<span>Translation required for preview</span>
						</PreviewMessage>
					) : cues.length === 0 ? (
						<PreviewMessage>
							<VideoOff className="h-8 w-8" />
							<span>No subtitles found</span>
						</PreviewMessage>
					) : (
						<SubtitleOverlay
							cue={activeCue}
							config={config}
							containerHeight={containerHeight}
						/>
					)}
				</div>
			</div>

			{/* Configuration Controls */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Quick Presets */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">Quick Styles</span>
						<Badge variant="outline" className="text-xs">
							{selectedPresetId === 'custom' ? 'Custom' : 'Preset'}
						</Badge>
					</div>
					<div className="grid grid-cols-2 gap-2">
						{subtitleRenderPresets.map((preset) => (
							<Button
								key={preset.id}
								type="button"
								size="sm"
								variant={preset.id === selectedPresetId ? 'default' : 'outline'}
								onClick={() => handlePresetClick(preset)}
								className="text-xs"
							>
								{preset.label}
							</Button>
						))}
					</div>
					{selectedPreset && (
						<p className="text-xs text-muted-foreground">
							{selectedPreset.description}
						</p>
					)}
				</div>

				{/* Manual Controls */}
				<div className="space-y-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<SlidersHorizontal className="h-4 w-4" />
						Manual Settings
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="subtitle-font-size" className="text-xs">Font Size</Label>
							<Input
								type="number"
								min={12}
								max={72}
								id="subtitle-font-size"
								value={config.fontSize}
								onChange={handleNumericChange('fontSize')}
								className="h-8 text-sm"
							/>
						</div>

						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<Label htmlFor="subtitle-background-opacity" className="text-xs">Opacity</Label>
								<span className="text-xs text-muted-foreground">
									{Math.round(config.backgroundOpacity * 100)}%
								</span>
							</div>
							<input
								type="range"
								id="subtitle-background-opacity"
								className="w-full h-2"
								min={0}
								max={100}
								step={1}
								value={Math.round(config.backgroundOpacity * 100)}
								onChange={handleOpacityChange}
							/>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-2">
						<div className="space-y-1">
							<Label htmlFor="subtitle-text-color" className="text-xs">Text</Label>
							<Input
								type="color"
								id="subtitle-text-color"
								value={config.textColor}
								onChange={handleColorChange('textColor')}
								className="h-8 w-full p-1 cursor-pointer"
							/>
						</div>

						<div className="space-y-1">
							<Label htmlFor="subtitle-background-color" className="text-xs">BG</Label>
							<Input
								type="color"
								id="subtitle-background-color"
								value={config.backgroundColor}
								onChange={handleColorChange('backgroundColor')}
								className="h-8 w-full p-1 cursor-pointer"
							/>
						</div>

						<div className="space-y-1">
							<Label htmlFor="subtitle-outline-color" className="text-xs">Outline</Label>
							<Input
								type="color"
								id="subtitle-outline-color"
								value={config.outlineColor}
								onChange={handleColorChange('outlineColor')}
								className="h-8 w-full p-1 cursor-pointer"
							/>
						</div>
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => handlePresetClick(DEFAULT_PRESET)}
						className="w-full text-xs"
					>
						Reset to Default
					</Button>
				</div>
			</div>

			{/* Render Button */}
			<div className="text-center">
				<Button
					onClick={() => onStart({ ...config })}
					disabled={isRendering || !translationAvailable}
					size="lg"
					className="w-full max-w-md"
				>
					{isRendering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{isRendering ? 'Rendering...' : 'Render Video with Subtitles'}
				</Button>
			</div>

			{errorMessage && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
					<AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
					<div>
						<h3 className="font-semibold text-red-800">Rendering Error</h3>
						<p className="text-sm text-red-700">{errorMessage}</p>
					</div>
				</div>
			)}

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
	)
}

function areConfigsEqual(a: SubtitleRenderConfig, b: SubtitleRenderConfig) {
	return (
		a.fontSize === b.fontSize &&
		Math.abs(a.backgroundOpacity - b.backgroundOpacity) < 0.001 &&
		normalizeHex(a.textColor) === normalizeHex(b.textColor) &&
		normalizeHex(a.backgroundColor) === normalizeHex(b.backgroundColor) &&
		normalizeHex(a.outlineColor) === normalizeHex(b.outlineColor)
	)
}

function normalizeHex(hex: string) {
	return hex.trim().toLowerCase()
}

interface SubtitleOverlayProps {
	cue: VttCue | null
	config: SubtitleRenderConfig
	containerHeight: number
}

function SubtitleOverlay(props: SubtitleOverlayProps) {
	const { cue, config, containerHeight } = props
	if (!cue) return null

	const baseFontSize = containerHeight
		? (config.fontSize / 1080) * containerHeight
		: config.fontSize
	const chineseFontSize = Math.max(baseFontSize, 16)
	const englishFontSize = Math.max(baseFontSize * 0.65, 12)
	const textShadowBlur = Math.max(chineseFontSize * 0.18, 4)
	const outlineColor = hexToRgba(config.outlineColor, 0.9)
	const textShadow = `0 0 ${textShadowBlur}px ${outlineColor}, 0 0 ${
		textShadowBlur * 0.75
	}px ${outlineColor}`
	const backgroundColor = hexToRgba(
		config.backgroundColor,
		config.backgroundOpacity,
	)

	const [firstLine, ...remaining] = cue.lines
	const hasChinese = remaining.length > 0
	const englishLine = hasChinese ? firstLine : cue.lines.join('\n')
	const chineseText = hasChinese ? remaining.join('\n') : ''

	return (
		<div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-[8%]">
			<div
				className="max-w-[90%] flex flex-col items-center gap-1 rounded-lg px-6 py-3 text-center"
				style={{
					backgroundColor,
					color: config.textColor,
					textShadow,
				}}
			>
				{englishLine && (
					<div
						style={{
							fontSize: `${englishFontSize}px`,
							lineHeight: 1.2,
							opacity: 0.92,
							whiteSpace: 'pre-wrap',
						}}
					>
						{englishLine}
					</div>
				)}
				{chineseText && (
					<div
						style={{
							fontSize: `${chineseFontSize}px`,
							lineHeight: 1.25,
							fontWeight: 600,
							whiteSpace: 'pre-wrap',
						}}
					>
						{chineseText}
					</div>
				)}
			</div>
		</div>
	)
}

function PreviewMessage(props: { children: ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 text-center text-sm text-muted-foreground">
			{props.children}
		</div>
	)
}

function parseVttTimestamp(value: string): number {
	const match = value.match(/(\d+):(\d+):(\d+)\.(\d{1,3})/)
	if (!match) return 0
	const [, hh, mm, ss, ms] = match
	return (
		parseInt(hh, 10) * 3600 +
		parseInt(mm, 10) * 60 +
		parseInt(ss, 10) +
		parseInt(ms.padEnd(3, '0'), 10) / 1000
	)
}

function hexToRgba(hex: string, opacity: number) {
	let normalized = hex.trim().replace('#', '')
	if (normalized.length === 3) {
		normalized = normalized
			.split('')
			.map((char) => char + char)
			.join('')
	}
	const int = Number.parseInt(normalized, 16)
	const r = (int >> 16) & 255
	const g = (int >> 8) & 255
	const b = int & 255
	const alpha = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}