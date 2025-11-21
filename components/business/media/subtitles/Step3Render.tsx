'use client'

import {
	type ChangeEvent,
	useState,
	useEffect,
} from 'react'
import {
	AlertCircle,
	Loader2,
} from 'lucide-react'
import { areConfigsEqual } from '~/lib/subtitle/utils/config'

import { Button } from '~/components/ui/button'
import { SUBTITLE_RENDER_PRESETS, DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'


import type {
	SubtitleRenderConfig,
	SubtitleRenderPreset,
	HintTextConfig,
	TimeSegmentEffect,
} from '~/lib/subtitle/types'

import { SubtitleConfigControls } from './SubtitleConfig/SubtitleConfigControls'
import { HintTextConfigControls } from './HintTextConfig/HintTextConfigControls'
import { TimeSegmentEffectsManager } from './TimeSegmentEffects/TimeSegmentEffectsManager'

type PresetId = SubtitleRenderPreset['id'] | 'custom'

interface Step3RenderProps {
	isRendering: boolean
	onStart: (config: SubtitleRenderConfig) => void
	errorMessage?: string
	translationAvailable: boolean
	config: SubtitleRenderConfig
	onConfigChange: (config: SubtitleRenderConfig) => void
	mediaDuration?: number
	currentPreviewTime?: number
	onPreviewSeek?: (time: number) => void

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
		translationAvailable,
		config,
		onConfigChange,
		mediaDuration,
		currentPreviewTime,
		onPreviewSeek,
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
		onPreviewSeek?.(time)
	}



	return (
		<div className="space-y-6">
		{/* 视频预览与字幕列表由顶部 PreviewPane 接管，此处不再重复渲染 */}

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
                            onSetOpacity={(v) => {
                                const value = Math.min(Math.max(v, COLOR_CONSTANTS.OPACITY_MIN), COLOR_CONSTANTS.OPACITY_MAX)
                                onConfigChange({ ...config, backgroundOpacity: value })
                            }}
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
							mediaDuration={mediaDuration}
							currentTime={currentPreviewTime}
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

// areConfigsEqual moved to shared util in ~/lib/subtitle/utils/config
