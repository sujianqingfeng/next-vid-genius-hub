'use client'

import { Video } from 'lucide-react'
import { ColorPickerGrid } from '~/components/ui/color-picker-grid'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import { DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import type { HintTextConfig } from '~/lib/subtitle/types'

interface HintTextConfigControlsProps {
	config?: HintTextConfig
	onChange: (
		field: keyof HintTextConfig,
		value: string | number | boolean,
	) => void
}

/**
 * 提示文本配置控制组件
 */
export function HintTextConfigControls({
	config,
	onChange,
}: HintTextConfigControlsProps) {
	const hintConfig = config || DEFAULT_SUBTITLE_RENDER_CONFIG.hintTextConfig!

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold flex items-center gap-2">
					<Video className="h-5 w-5" />
					Black Screen Hint Text
				</h3>
				<div className="flex items-center space-x-2">
					<Switch
						id="hint-text-enabled"
						checked={hintConfig.enabled}
						onCheckedChange={(checked) => onChange('enabled', checked === true)}
					/>
					<Label htmlFor="hint-text-enabled" className="text-sm">
						Enable hint text
					</Label>
				</div>
			</div>

			{hintConfig.enabled && (
				<div className="space-y-4 p-4 border rounded-lg">
					{/* 文本内容 */}
					<div className="space-y-2">
						<Label htmlFor="hint-text-content" className="text-sm font-medium">
							Hint Text Content
						</Label>
						<Textarea
							id="hint-text-content"
							placeholder="Enter hint text to display during black screen..."
							value={hintConfig.text}
							onChange={(e) => onChange('text', e.target.value)}
							className="min-h-[60px] text-sm"
							maxLength={200}
						/>
					</div>

					{/* 基础配置 */}
					<div className="grid gap-4 md:grid-cols-2">
						{/* 字体大小 */}
						<div className="space-y-2">
							<Label htmlFor="hint-font-size" className="text-sm font-medium">
								Font Size
							</Label>
							<Input
								type="number"
								min={COLOR_CONSTANTS.FONT_SIZE_MIN}
								max={COLOR_CONSTANTS.FONT_SIZE_MAX}
								id="hint-font-size"
								value={hintConfig.fontSize}
								onChange={(e) => {
									const value = Number(e.target.value)
									if (!Number.isNaN(value)) {
										const clamped = Math.min(
											Math.max(value, COLOR_CONSTANTS.FONT_SIZE_MIN),
											COLOR_CONSTANTS.FONT_SIZE_MAX,
										)
										onChange('fontSize', clamped)
									}
								}}
								className="h-8 text-sm"
							/>
						</div>

						{/* 位置 */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Position</Label>
							<Select
								value={hintConfig.position}
								onValueChange={(value: 'center' | 'top' | 'bottom') =>
									onChange('position', value)
								}
							>
								<SelectTrigger className="h-8 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="center">Center</SelectItem>
									<SelectItem value="top">Top</SelectItem>
									<SelectItem value="bottom">Bottom</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* 动画 */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Animation</Label>
							<Select
								value={hintConfig.animation || 'none'}
								onValueChange={(value: 'fade-in' | 'slide-up' | 'none') =>
									onChange('animation', value)
								}
							>
								<SelectTrigger className="h-8 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									<SelectItem value="fade-in">Fade In</SelectItem>
									<SelectItem value="slide-up">Slide Up</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* 透明度 */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label
									htmlFor="hint-background-opacity"
									className="text-sm font-medium"
								>
									Background Opacity
								</Label>
								<span className="text-xs text-muted-foreground">
									{Math.round(hintConfig.backgroundOpacity * 100)}%
								</span>
							</div>
							<input
								type="range"
								id="hint-background-opacity"
								className="w-full h-2"
								min={0}
								max={100}
								step={1}
								value={Math.round(hintConfig.backgroundOpacity * 100)}
								onChange={(e) => {
									const value = Number(e.target.value) / 100
									if (!Number.isNaN(value)) {
										onChange(
											'backgroundOpacity',
											Math.min(
												Math.max(value, COLOR_CONSTANTS.OPACITY_MIN),
												COLOR_CONSTANTS.OPACITY_MAX,
											),
										)
									}
								}}
							/>
						</div>
					</div>

					{/* 颜色控制 */}
					<ColorPickerGrid
						labelClassName="text-xs"
						fields={[
							{
								id: 'hint-text-color',
								label: 'Text',
								value: hintConfig.textColor,
								onChange: (e) => onChange('textColor', e.target.value),
							},
							{
								id: 'hint-background-color',
								label: 'BG',
								value: hintConfig.backgroundColor,
								onChange: (e) => onChange('backgroundColor', e.target.value),
							},
							{
								id: 'hint-outline-color',
								label: 'Outline',
								value: hintConfig.outlineColor,
								onChange: (e) => onChange('outlineColor', e.target.value),
							},
						]}
					/>
				</div>
			)}
		</div>
	)
}
