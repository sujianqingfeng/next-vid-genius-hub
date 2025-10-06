'use client'

import { useState } from 'react'
import {
	Scissors,
	VolumeX,
	Video,
	Plus,
	Trash2,
	Edit,
	X,
	Check,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import type { TimeSegmentEffect } from '~/lib/subtitle/types'
import { formatTimeForDisplay, isValidTimeRange } from '~/lib/subtitle/utils/time'

interface TimeSegmentEffectsManagerProps {
	effects: TimeSegmentEffect[]
	onChange: (effects: TimeSegmentEffect[]) => void
	mediaDuration?: number
	currentTime?: number
}

/**
 * 时间段效果管理器组件
 * 完整版本，支持添加、编辑、删除时间段效果
 */
export function TimeSegmentEffectsManager({
	effects,
	onChange,
	mediaDuration = 0,
	currentTime = 0,
}: TimeSegmentEffectsManagerProps) {
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
	const [editingEffect, setEditingEffect] = useState<TimeSegmentEffect | null>(null)

	// 添加或更新效果
	const handleSaveEffect = (effect: TimeSegmentEffect) => {
		if (!isValidTimeRange(effect.startTime, effect.endTime)) {
			alert('无效的时间范围：开始时间必须小于结束时间')
			return
		}

		const existingIndex = effects.findIndex(e => e.id === effect.id)
		let newEffects: TimeSegmentEffect[]

		if (existingIndex >= 0) {
			// 更新现有效果
			newEffects = [...effects]
			newEffects[existingIndex] = effect
		} else {
			// 添加新效果
			newEffects = [...effects, effect]
		}

		// 按开始时间排序
		newEffects.sort((a, b) => a.startTime - b.startTime)
		onChange(newEffects)
		setIsAddDialogOpen(false)
		setEditingEffect(null)
	}

	// 删除效果
	const handleDeleteEffect = (id: string) => {
		onChange(effects.filter(e => e.id !== id))
	}

	// 开始编辑效果
	const handleEditEffect = (effect: TimeSegmentEffect) => {
		setEditingEffect({ ...effect })
		setIsAddDialogOpen(true)
	}

	// 添加新效果
	const handleAddNewEffect = () => {
		const newEffect: TimeSegmentEffect = {
			id: `effect-${Date.now()}`,
			startTime: Math.max(0, currentTime),
			endTime: Math.min(mediaDuration, currentTime + 5),
			muteAudio: false,
			blackScreen: true,
			description: '',
		}
		setEditingEffect(newEffect)
		setIsAddDialogOpen(true)
	}

	// 关闭对话框
	const handleCloseDialog = () => {
		setIsAddDialogOpen(false)
		setEditingEffect(null)
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold flex items-center gap-2">
					<Scissors className="h-5 w-5" />
					Time Segment Effects
				</h3>
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-xs">
						{effects.length} effects
					</Badge>
					<Button
						variant="outline"
						size="sm"
						onClick={handleAddNewEffect}
					>
						<Plus className="h-4 w-4 mr-1" />
						Add Effect
					</Button>
				</div>
			</div>

			{effects.length === 0 ? (
				<div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
					<Scissors className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
					<p className="text-muted-foreground">No time segment effects configured</p>
					<p className="text-sm text-muted-foreground mt-2">
						Add effects to create black screens or mute audio during specific time ranges
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-4"
						onClick={handleAddNewEffect}
					>
						<Plus className="h-4 w-4 mr-1" />
						Add Your First Effect
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{effects.map((effect, index) => (
						<div
							key={effect.id}
							className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
						>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-1">
									<span className="font-medium text-sm">
										{formatTimeForDisplay(effect.startTime)} - {formatTimeForDisplay(effect.endTime)}
									</span>
									{effect.muteAudio && (
										<Badge variant="secondary" className="text-xs">
											<VolumeX className="h-3 w-3 mr-1" />
											Muted
										</Badge>
									)}
									{effect.blackScreen && (
										<Badge variant="secondary" className="text-xs">
											<Video className="h-3 w-3 mr-1" />
											Black Screen
										</Badge>
									)}
								</div>
								{effect.description && (
									<p className="text-xs text-muted-foreground">{effect.description}</p>
								)}
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => handleEditEffect(effect)}
									className="h-8 w-8"
								>
									<Edit className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => handleDeleteEffect(effect.id)}
									className="h-8 w-8 text-destructive hover:text-destructive"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}

			{/* 添加/编辑效果对话框 */}
			<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingEffect?.id && effects.some(e => e.id === editingEffect.id)
								? 'Edit Time Segment Effect'
								: 'Add Time Segment Effect'}
						</DialogTitle>
					</DialogHeader>
					{editingEffect && (
						<EffectEditForm
							effect={editingEffect}
							existingEffects={effects}
							mediaDuration={mediaDuration}
							onSave={handleSaveEffect}
							onCancel={handleCloseDialog}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}

interface EffectEditFormProps {
	effect: TimeSegmentEffect
	existingEffects: TimeSegmentEffect[]
	mediaDuration: number
	onSave: (effect: TimeSegmentEffect) => void
	onCancel: () => void
}

/**
 * 效果编辑表单组件
 */
function EffectEditForm({ effect, existingEffects, mediaDuration, onSave, onCancel }: EffectEditFormProps) {
	const [formData, setFormData] = useState<TimeSegmentEffect>(effect)

	const handleChange = (field: keyof TimeSegmentEffect, value: any) => {
		setFormData(prev => ({ ...prev, [field]: value }))
	}

	const handleSubmit = () => {
		onSave(formData)
	}

	return (
		<div className="space-y-4">
			{/* 时间范围 */}
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="start-time">Start Time (seconds)</Label>
					<Input
						id="start-time"
						type="number"
						min={0}
						max={mediaDuration}
						step={0.1}
						value={formData.startTime}
						onChange={(e) => handleChange('startTime', Number(e.target.value))}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="end-time">End Time (seconds)</Label>
					<Input
						id="end-time"
						type="number"
						min={0}
						max={mediaDuration}
						step={0.1}
						value={formData.endTime}
						onChange={(e) => handleChange('endTime', Number(e.target.value))}
					/>
				</div>
			</div>

			{/* 效果选项 */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label htmlFor="black-screen">Black Screen</Label>
					<Switch
						id="black-screen"
						checked={formData.blackScreen}
						onCheckedChange={(checked) => handleChange('blackScreen', checked)}
					/>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="mute-audio">Mute Audio</Label>
					<Switch
						id="mute-audio"
						checked={formData.muteAudio}
						onCheckedChange={(checked) => handleChange('muteAudio', checked)}
					/>
				</div>
			</div>

			{/* 描述 */}
			<div className="space-y-2">
				<Label htmlFor="description">Description (optional)</Label>
				<Textarea
					id="description"
					placeholder="Describe this effect..."
					value={formData.description || ''}
					onChange={(e) => handleChange('description', e.target.value)}
					className="min-h-[60px]"
					maxLength={100}
				/>
			</div>

			{/* 操作按钮 */}
			<div className="flex justify-end gap-2 pt-4">
				<Button variant="outline" onClick={onCancel}>
					<X className="h-4 w-4 mr-1" />
					Cancel
				</Button>
				<Button onClick={handleSubmit}>
					<Check className="h-4 w-4 mr-1" />
					{effect.id && existingEffects.some(e => e.id === effect.id) ? 'Update' : 'Add'}
				</Button>
			</div>
		</div>
	)
}