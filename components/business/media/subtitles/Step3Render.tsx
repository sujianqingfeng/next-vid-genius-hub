'use client'

import {
	type ChangeEvent,
	useState,
	useEffect,
	useRef,
} from 'react'
import {
	AlertCircle,
	Loader2,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { SUBTITLE_RENDER_PRESETS, DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
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

	return (
		<div className="space-y-6">
			{/* 视频预览区域 */}
			<VideoPreview
				mediaId={mediaId}
				translation={translation}
				config={config}
				isRendering={isRendering}
				onTimeUpdate={handleTimeUpdate}
				onDurationChange={handleDurationChange}
				onVideoRef={handleVideoRef}
			/>

			{/* 配置控制区域 */}
			<div className="space-y-6">
				{/* 快速预设和手动设置 */}
				<div className="grid gap-6 md:grid-cols-2">
					{/* 快速预设 */}
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

					{/* 提示文本配置 */}
					<HintTextConfigControls
						config={config.hintTextConfig}
						onChange={handleHintTextChange}
					/>
				</div>

				{/* 时间段效果管理 */}
				<TimeSegmentEffectsManager
					effects={config.timeSegmentEffects}
					onChange={handleTimeSegmentEffectsChange}
					mediaDuration={duration}
					currentTime={currentTime}
					onPlayPreview={handlePlayPreview}
				/>

				{/* 渲染按钮 */}
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