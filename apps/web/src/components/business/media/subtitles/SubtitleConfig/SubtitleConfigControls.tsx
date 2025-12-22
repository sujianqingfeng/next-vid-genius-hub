'use client'

import { Palette, SlidersHorizontal } from 'lucide-react'
import { type ChangeEvent } from 'react'
import { ColorPickerGrid } from '~/components/business/media/subtitles/ColorPickerGrid'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type {
	SubtitleRenderConfig,
	SubtitleRenderPreset,
} from '~/lib/subtitle/types'

interface SubtitleConfigControlsProps {
	presets: readonly SubtitleRenderPreset[]
	selectedPresetId: string | 'custom'
	selectedPreset?: SubtitleRenderPreset
	onPresetClick: (preset: SubtitleRenderPreset) => void
	config: SubtitleRenderConfig
	onNumericChange: (
		field: keyof SubtitleRenderConfig,
	) => (event: ChangeEvent<HTMLInputElement>) => void
	onOpacityChange: (event: ChangeEvent<HTMLInputElement>) => void
	onColorChange: (
		field: keyof SubtitleRenderConfig,
	) => (event: ChangeEvent<HTMLInputElement>) => void
	onSetOpacity: (value: number) => void
}

/**
 * 字幕配置控制组件
 */
export function SubtitleConfigControls({
	presets,
	selectedPresetId,
	selectedPreset,
	onPresetClick,
	config,
	onNumericChange,
	onOpacityChange,
	onColorChange,
	onSetOpacity,
}: SubtitleConfigControlsProps) {
	const bgEnabled = (config.backgroundOpacity ?? 0) > 0
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">Subtitle Settings</h3>
				<Badge variant="outline" className="text-xs">
					{selectedPresetId === 'custom' ? 'Custom' : 'Preset'}
				</Badge>
			</div>

			<Tabs defaultValue="presets" className="w-full">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="presets" className="text-xs">
						<Palette className="h-3 w-3 mr-1" />
						Presets
					</TabsTrigger>
					<TabsTrigger value="manual" className="text-xs">
						<SlidersHorizontal className="h-3 w-3 mr-1" />
						Manual
					</TabsTrigger>
				</TabsList>

				<TabsContent value="presets" className="space-y-3 mt-4">
					<div className="grid grid-cols-2 gap-2">
						{presets.map((preset) => (
							<Button
								key={preset.id}
								type="button"
								size="sm"
								variant={preset.id === selectedPresetId ? 'default' : 'outline'}
								onClick={() => onPresetClick(preset)}
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
				</TabsContent>

				<TabsContent value="manual" className="space-y-4 mt-4">
					<div className="grid grid-cols-1 gap-4">
						{/* 字体大小和背景透明度 */}
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="subtitle-font-size" className="text-xs">
									Font Size
								</Label>
								<Input
									type="number"
									min={12}
									max={72}
									id="subtitle-font-size"
									value={config.fontSize}
									onChange={onNumericChange('fontSize')}
									className="h-8 text-sm"
								/>
							</div>

							<div className="space-y-1.5">
								<div className="flex items-center justify-between">
									<Label
										htmlFor="subtitle-background-opacity"
										className="text-xs"
									>
										Opacity
									</Label>
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
									onChange={onOpacityChange}
								/>
							</div>
						</div>

						{/* 背景开关 */}
						<div className="flex items-center justify-between">
							<Label htmlFor="subtitle-bg-enabled" className="text-xs">
								Background
							</Label>
							<Switch
								id="subtitle-bg-enabled"
								checked={bgEnabled}
								onCheckedChange={(checked) => {
									if (!checked) {
										onSetOpacity(0)
									} else {
										onSetOpacity(
											config.backgroundOpacity > 0
												? config.backgroundOpacity
												: 0.65,
										)
									}
								}}
							/>
						</div>

						{/* 颜色控制 */}
						<div className="space-y-2">
							<Label className="text-xs font-medium">Colors</Label>
							<ColorPickerGrid
								fields={[
									{
										id: 'subtitle-text-color',
										label: 'Text',
										value: config.textColor,
										onChange: onColorChange('textColor'),
									},
									{
										id: 'subtitle-background-color',
										label: 'BG',
										value: config.backgroundColor,
										onChange: onColorChange('backgroundColor'),
									},
									{
										id: 'subtitle-outline-color',
										label: 'Outline',
										value: config.outlineColor,
										onChange: onColorChange('outlineColor'),
									},
								]}
							/>
						</div>

						{/* 重置按钮 */}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onPresetClick(presets[0])}
							className="w-full text-xs"
						>
							Reset to Default
						</Button>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
