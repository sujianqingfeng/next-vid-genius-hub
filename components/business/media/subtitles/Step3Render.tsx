'use client'

import {
	type ChangeEvent,
	useState,
	useEffect,
	useRef,
	useMemo,
} from 'react'
import {
	AlertCircle,
	Loader2,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { SUBTITLE_RENDER_PRESETS, DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { parseVttTimestamp } from '~/lib/subtitle/utils/time'
import type {
	SubtitleRenderConfig,
	SubtitleRenderPreset,
	HintTextConfig,
	TimeSegmentEffect,
} from '~/lib/subtitle/types'
import { VideoPreview } from './VideoPreview/VideoPreview'
import { SubtitleConfigControls } from './SubtitleConfig/SubtitleConfigControls'
import { HintTextConfigControls } from './HintTextConfig/HintTextConfigControls'
import { TimeSegmentEffectsManager } from './TimeSegmentEffects/TimeSegmentEffectsManager'

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
	renderBackend: 'local' | 'cloud'
	onRenderBackendChange: (backend: 'local' | 'cloud') => void
}

/**
 * 重构后的Step3渲染组件
 * 使用子组件和自定义Hook来降低复杂度
 */
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
		renderBackend,
		onRenderBackendChange,
	} = props

	// 预设状态管理
	const [selectedPresetId, setSelectedPresetId] = useState<PresetId>(() => {
		const matching = SUBTITLE_RENDER_PRESETS.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		return matching?.id ?? 'custom'
	})

	// 更新预设选择
	useEffect(() => {
		const matching = SUBTITLE_RENDER_PRESETS.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		const nextId: PresetId = matching?.id ?? 'custom'
		setSelectedPresetId((prev) => (prev === nextId ? prev : nextId))
	}, [config])

	const selectedPreset = SUBTITLE_RENDER_PRESETS.find((preset) => preset.id === selectedPresetId)

	// 视频状态管理
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const videoRef = useRef<HTMLVideoElement>(null)

	// 预设点击处理
	const handlePresetClick = (preset: SubtitleRenderPreset) => {
		setSelectedPresetId(preset.id)
		onConfigChange({ ...preset.config })
	}

	// 字体大小变化处理
	const handleNumericChange = (field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.target.value)
			if (Number.isNaN(value)) return
			const clamped = Math.min(Math.max(value, COLOR_CONSTANTS.FONT_SIZE_MIN), COLOR_CONSTANTS.FONT_SIZE_MAX)
			onConfigChange({ ...config, [field]: clamped })
		}

	// 透明度变化处理
	const handleOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
		const value = Number(event.target.value) / 100
		if (Number.isNaN(value)) return
		onConfigChange({
			...config,
			backgroundOpacity: Math.min(Math.max(value, COLOR_CONSTANTS.OPACITY_MIN), COLOR_CONSTANTS.OPACITY_MAX)
		})
	}

	// 颜色变化处理
	const handleColorChange = (field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			onConfigChange({ ...config, [field]: event.target.value })
		}

	// 提示文本配置变化处理
	const handleHintTextChange = (field: keyof HintTextConfig, value: string | number | boolean) => {
		const currentConfig = config.hintTextConfig || DEFAULT_SUBTITLE_RENDER_CONFIG.hintTextConfig!

		let hintTextConfig: HintTextConfig
		if (field === 'position') {
			hintTextConfig = { ...currentConfig, [field]: value as 'center' | 'top' | 'bottom' }
		} else if (field === 'animation') {
			hintTextConfig = { ...currentConfig, [field]: value as 'fade-in' | 'slide-up' | 'none' | undefined }
		} else if (field === 'enabled') {
			hintTextConfig = { ...currentConfig, [field]: value as boolean }
		} else if (field === 'fontSize' || field === 'backgroundOpacity') {
			hintTextConfig = { ...currentConfig, [field]: value as number }
		} else {
			hintTextConfig = { ...currentConfig, [field]: value as string }
		}

		onConfigChange({ ...config, hintTextConfig })
	}

	// 时间段效果变化处理
	const handleTimeSegmentEffectsChange = (effects: TimeSegmentEffect[]) => {
		onConfigChange({ ...config, timeSegmentEffects: effects })
	}

	// 预览时间点播放
	const handlePlayPreview = (time: number) => {
		if (videoRef.current) {
			videoRef.current.currentTime = time
		}
	}

	// 处理视频时长变化
	const handleDurationChange = (newDuration: number) => {
		setDuration(newDuration)
	}

	// 处理视频时间更新
	const handleTimeUpdate = (newTime: number) => {
		setCurrentTime(newTime)
	}

	// 处理视频元素引用
	const handleVideoRef = (ref: HTMLVideoElement | null) => {
		videoRef.current = ref
	}

	// 解析字幕列表
	const cues = useMemo(
		() => (translation ? parseVttCues(translation) : []),
		[translation],
	)

	return (
		<div className="space-y-6">
			{/* 视频预览 + 字幕列表 - 并排布局 */}
			<div className="grid gap-4 lg:grid-cols-3">
				{/* 左/上：视频预览区域 */}
				<div className="lg:col-span-2 rounded-xl border bg-card shadow-sm">
					<VideoPreview
						mediaId={mediaId}
						translation={translation}
						config={config}
						isRendering={isRendering}
						onTimeUpdate={handleTimeUpdate}
						onDurationChange={handleDurationChange}
						onVideoRef={handleVideoRef}
					/>
				</div>

				{/* 右：字幕列表 */}
				<div className="flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden max-h-[600px]">
					<div className="flex-shrink-0 px-4 py-3 border-b bg-muted/30">
						<h3 className="text-sm font-semibold mb-2">Subtitles</h3>
						<Badge variant="secondary" className="text-xs">
							{cues.length} cues
						</Badge>
					</div>
					<div className="flex-1 min-h-0 overflow-y-auto">
						{cues.length === 0 ? (
							<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
								No subtitles available
							</div>
						) : (
							<div className="divide-y">
								{cues.map((cue, idx) => (
									<div
										key={`${cue.start}-${cue.end}-${idx}`}
										className="px-3 py-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
										onClick={() => handlePlayPreview(parseVttTimestamp(cue.start))}
									>
										<div className="text-muted-foreground font-mono text-[10px] mb-1">
											{cue.start} → {cue.end}
										</div>
										<div className="space-y-0.5">
											{cue.lines.map((line, i) => (
												<div key={i} className="text-xs font-mono break-words leading-snug">
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

			{/* 配置控制区域 - 下方紧凑布局 */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* 左列：基础配置 */}
				<div className="space-y-4">
					{/* 预设选择器 */}
					<div className="rounded-lg border bg-card p-4">
						<h3 className="text-sm font-medium mb-3">Quick Presets</h3>
						<SubtitleConfigControls
							presets={SUBTITLE_RENDER_PRESETS}
							selectedPresetId={selectedPresetId}
							selectedPreset={selectedPreset}
							onPresetClick={handlePresetClick}
							config={config}
							onNumericChange={handleNumericChange}
							onOpacityChange={handleOpacityChange}
							onColorChange={handleColorChange}
						/>
					</div>

					{/* 提示文本配置 */}
					<div className="rounded-lg border bg-card p-4">
						<h3 className="text-sm font-medium mb-3">Hint Text</h3>
						<HintTextConfigControls
							config={config.hintTextConfig}
							onChange={handleHintTextChange}
						/>
					</div>
				</div>

				{/* 右列：高级配置 */}
				<div className="space-y-4">
					{/* 时间段效果管理 */}
					<div className="rounded-lg border bg-card p-4">
						<h3 className="text-sm font-medium mb-3">Time Effects</h3>
						<TimeSegmentEffectsManager
							effects={config.timeSegmentEffects}
							onChange={handleTimeSegmentEffectsChange}
							mediaDuration={duration}
							currentTime={currentTime}
							onPlayPreview={handlePlayPreview}
						/>
					</div>

					{/* 渲染控制 */}
					<div className="rounded-lg border bg-card p-4">
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium">Render Settings</h3>
								{translationAvailable ? (
									<span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
										Ready
									</span>
								) : (
									<span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
										Need Translation
									</span>
								)}
							</div>
							
							{/* 渲染后端选择 */}
							<div className="space-y-2">
								<label className="text-xs font-medium">Backend</label>
								<div className="inline-flex gap-2 w-full">
									<Button
										variant={renderBackend === 'cloud' ? 'default' : 'outline'}
										size="sm"
										onClick={() => onRenderBackendChange('cloud')}
										className="flex-1"
									>
										Cloud
									</Button>
									<Button
										variant={renderBackend === 'local' ? 'default' : 'outline'}
										size="sm"
										onClick={() => onRenderBackendChange('local')}
										className="flex-1"
									>
										Local
									</Button>
								</div>
							</div>

							<Button
								onClick={() => onStart({ ...config })}
								disabled={isRendering || !translationAvailable}
								size="lg"
								className="w-full h-11"
							>
								{isRendering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{isRendering ? 'Rendering...' : 'Render Video with Subtitles'}
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* 错误信息 */}
			{errorMessage && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
					<AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
					<div>
						<h3 className="font-semibold text-red-800">Rendering Error</h3>
						<p className="text-sm text-red-700">{errorMessage}</p>
					</div>
				</div>
			)}
		</div>
	)
}

/**
 * 比较两个字幕配置是否相等
 */
function areConfigsEqual(configA: SubtitleRenderConfig, configB: SubtitleRenderConfig): boolean {
	// 基础配置比较
	const basicConfigEqual =
		configA.fontSize === configB.fontSize &&
		Math.abs(configA.backgroundOpacity - configB.backgroundOpacity) < 0.001 &&
		configA.textColor.toLowerCase() === configB.textColor.toLowerCase() &&
		configA.backgroundColor.toLowerCase() === configB.backgroundColor.toLowerCase() &&
		configA.outlineColor.toLowerCase() === configB.outlineColor.toLowerCase() &&
		configA.timeSegmentEffects.length === configB.timeSegmentEffects.length

	if (!basicConfigEqual) return false

	// 提示文本配置比较
	const hintConfigA = configA.hintTextConfig
	const hintConfigB = configB.hintTextConfig

	if (!hintConfigA && !hintConfigB) return true
	if (!hintConfigA || !hintConfigB) return false

	return (
		hintConfigA.enabled === hintConfigB.enabled &&
		hintConfigA.text === hintConfigB.text &&
		hintConfigA.fontSize === hintConfigB.fontSize &&
		hintConfigA.textColor.toLowerCase() === hintConfigB.textColor.toLowerCase() &&
		hintConfigA.backgroundColor.toLowerCase() === hintConfigB.backgroundColor.toLowerCase() &&
		Math.abs((hintConfigA.backgroundOpacity ?? 0.8) - (hintConfigB.backgroundOpacity ?? 0.8)) < 0.001 &&
		hintConfigA.outlineColor.toLowerCase() === hintConfigB.outlineColor.toLowerCase() &&
		hintConfigA.position === hintConfigB.position &&
		hintConfigA.animation === hintConfigB.animation
	)
}