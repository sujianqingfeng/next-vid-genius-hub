'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import { type ChangeEvent, useEffect, useState } from 'react'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { Button } from '~/components/ui/button'
import { useTranslations } from '~/lib/i18n'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import {
	DEFAULT_SUBTITLE_RENDER_CONFIG,
	SUBTITLE_RENDER_PRESETS,
} from '~/lib/subtitle/config/presets'
import type {
	HintTextConfig,
	SubtitleRenderConfig,
	SubtitleRenderPreset,
	TimeSegmentEffect,
} from '~/lib/subtitle/types'
import { areConfigsEqual } from '~/lib/subtitle/utils/config'
import { HintTextConfigControls } from './HintTextConfig/HintTextConfigControls'
import { SubtitleConfigControls } from './SubtitleConfig/SubtitleConfigControls'
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
	cloudStatus?: {
		status?: string
		phase?: string
		progress?: number | null
		jobId?: string | null
	} | null
}

/**
 * Redesigned Step3Render component
 */
export function Step3Render(props: Step3RenderProps) {
	const t = useTranslations('Subtitles')
	const tHintText = useTranslations('Subtitles.ui.hintTextConfig')
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
		cloudStatus,
	} = props

	// Preset state management
	const [selectedPresetId, setSelectedPresetId] = useState<PresetId>(() => {
		const matching = SUBTITLE_RENDER_PRESETS.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		return matching?.id ?? 'custom'
	})

	// Update preset selection when config changes
	useEffect(() => {
		const matching = SUBTITLE_RENDER_PRESETS.find((preset) =>
			areConfigsEqual(preset.config, config),
		)
		const nextId: PresetId = matching?.id ?? 'custom'
		setSelectedPresetId((prev) => (prev === nextId ? prev : nextId))
	}, [config])

	const selectedPreset = SUBTITLE_RENDER_PRESETS.find(
		(preset) => preset.id === selectedPresetId,
	)

	// Handle preset click
	const handlePresetClick = (preset: SubtitleRenderPreset) => {
		setSelectedPresetId(preset.id)
		onConfigChange({ ...preset.config })
	}

	// Handle numeric changes (font size)
	const handleNumericChange =
		(field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.target.value)
			if (Number.isNaN(value)) return
			const clamped = Math.min(
				Math.max(value, COLOR_CONSTANTS.FONT_SIZE_MIN),
				COLOR_CONSTANTS.FONT_SIZE_MAX,
			)
			onConfigChange({ ...config, [field]: clamped })
		}

	// Handle opacity changes
	const handleOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
		const value = Number(event.target.value) / 100
		if (Number.isNaN(value)) return
		onConfigChange({
			...config,
			backgroundOpacity: Math.min(
				Math.max(value, COLOR_CONSTANTS.OPACITY_MIN),
				COLOR_CONSTANTS.OPACITY_MAX,
			),
		})
	}

	// Handle color changes
	const handleColorChange =
		(field: keyof SubtitleRenderConfig) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			onConfigChange({ ...config, [field]: event.target.value })
		}

	// Handle hint text config changes
	const handleHintTextChange = (
		field: keyof HintTextConfig,
		value: string | number | boolean,
	) => {
		const defaultHintConfig = DEFAULT_SUBTITLE_RENDER_CONFIG.hintTextConfig!
		const currentConfig = config.hintTextConfig || {
			...defaultHintConfig,
			text: defaultHintConfig.text || tHintText('defaultText'),
		}

		let hintTextConfig: HintTextConfig
		if (field === 'position') {
			hintTextConfig = {
				...currentConfig,
				[field]: value as 'center' | 'top' | 'bottom',
			}
		} else if (field === 'animation') {
			hintTextConfig = {
				...currentConfig,
				[field]: value as 'fade-in' | 'slide-up' | 'none' | undefined,
			}
		} else if (field === 'enabled') {
			const nextEnabled = value as boolean
			hintTextConfig = {
				...currentConfig,
				[field]: nextEnabled,
				text:
					nextEnabled && !currentConfig.text
						? tHintText('defaultText')
						: currentConfig.text,
			}
		} else if (field === 'fontSize' || field === 'backgroundOpacity') {
			hintTextConfig = { ...currentConfig, [field]: value as number }
		} else {
			hintTextConfig = { ...currentConfig, [field]: value as string }
		}

		onConfigChange({ ...config, hintTextConfig })
	}

	// Handle time segment effects changes
	const handleTimeSegmentEffectsChange = (effects: TimeSegmentEffect[]) => {
		onConfigChange({ ...config, timeSegmentEffects: effects })
	}

	// Play preview at time
	const handlePlayPreview = (time: number) => {
		onPreviewSeek?.(time)
	}

	return (
		<div className="space-y-8">
			{/* Header / Actions */}
			<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-border pb-6">
				<div className="space-y-1">
					<h3 className="text-base font-bold uppercase tracking-wide text-foreground">
						{t('render.title')}
					</h3>
					<p className="text-xs font-mono text-muted-foreground">
						{t('render.desc')}
					</p>
				</div>
				<div className="flex items-center gap-3">
					<span
						className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border ${
							translationAvailable
								? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10'
								: 'border-amber-500/50 text-amber-600 bg-amber-500/10'
						}`}
					>
						{translationAvailable
							? t('render.badges.ready')
							: t('render.badges.needTranslation')}
					</span>
					{(cloudStatus?.status ||
						typeof cloudStatus?.progress === 'number') && (
						<CloudJobProgress
							status={cloudStatus?.status}
							phase={cloudStatus?.phase}
							progress={
								typeof cloudStatus?.progress === 'number'
									? cloudStatus.progress
									: null
							}
							jobId={cloudStatus?.jobId}
							showPhase={Boolean(cloudStatus?.phase)}
							showIds={Boolean(cloudStatus?.jobId)}
							showCompactLabel={false}
							labels={{
								status: t('render.progressLabels.status'),
								phase: t('render.progressLabels.phase'),
							}}
						/>
					)}
					<Button
						onClick={() => onStart({ ...config })}
						disabled={isRendering || !translationAvailable}
						size="lg"
						className="min-w-[160px] h-11 rounded-none uppercase text-xs font-bold tracking-wide"
					>
						{isRendering && (
							<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
						)}
						{isRendering ? t('render.starting') : t('render.start')}
					</Button>
				</div>
			</div>

			{/* Configuration Area */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Left Column: Basic Config */}
				<div className="space-y-6">
					<div className="border border-border bg-background p-4">
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
								const value = Math.min(
									Math.max(v, COLOR_CONSTANTS.OPACITY_MIN),
									COLOR_CONSTANTS.OPACITY_MAX,
								)
								onConfigChange({ ...config, backgroundOpacity: value })
							}}
						/>
					</div>

					<div className="border border-border bg-background p-4">
						<HintTextConfigControls
							config={config.hintTextConfig}
							onChange={handleHintTextChange}
						/>
					</div>
				</div>

				{/* Right Column: Advanced Config */}
				<div className="space-y-6">
					<div className="border border-border bg-background p-4">
						<TimeSegmentEffectsManager
							effects={config.timeSegmentEffects}
							onChange={handleTimeSegmentEffectsChange}
							mediaDuration={mediaDuration}
							currentTime={currentPreviewTime}
							onPlayPreview={handlePlayPreview}
						/>
					</div>
				</div>
			</div>

			{/* Error Message */}
			{errorMessage && (
				<div className="flex items-start gap-3 border border-destructive/50 bg-destructive/5 p-4">
					<AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
					<div>
						<h3 className="text-sm font-bold uppercase tracking-wide text-destructive">
							{t('render.errorTitle')}
						</h3>
						<p className="text-xs font-mono text-destructive/80 mt-1">
							{errorMessage}
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
