'use client'

import { useState, useCallback, useEffect } from 'react'
import {
	Plus,
	Trash2,
	EyeOff,
	Settings,
	Clock,
	VolumeX,
	Scissors,
	Play,
	Pause,
	SkipForward,
	SkipBack,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Badge } from '~/components/ui/badge'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { type TimeSegmentEffect } from '~/lib/media/types'

interface TimeSegmentManagerProps {
	effects: TimeSegmentEffect[]
	onChange: (effects: TimeSegmentEffect[]) => void
	mediaDuration?: number
	videoRef?: React.RefObject<HTMLVideoElement | null>
}

export function TimeSegmentManager({ effects, onChange, mediaDuration, videoRef }: TimeSegmentManagerProps) {
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
	const [editingEffect, setEditingEffect] = useState<TimeSegmentEffect | null>(null)
	const [isSelectingRange, setIsSelectingRange] = useState(false)
	const [rangeStart, setRangeStart] = useState<number | null>(null)
	const [currentTime, setCurrentTime] = useState(0)
	const [isPlaying, setIsPlaying] = useState(false)

	
	const handleEditEffect = (effect: TimeSegmentEffect) => {
		setEditingEffect({ ...effect })
		setIsAddDialogOpen(true)
	}

	const handleSaveEffect = (effect: TimeSegmentEffect) => {
		if (effect.startTime >= effect.endTime) {
			return // 验证时间范围
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

	const handleDeleteEffect = (id: string) => {
		onChange(effects.filter(e => e.id !== id))
	}

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	// Video controls
	const handlePlayPause = useCallback(() => {
		if (!videoRef?.current) return

		if (isPlaying) {
			videoRef.current.pause()
		} else {
			videoRef.current.play()
		}
		setIsPlaying(!isPlaying)
	}, [isPlaying, videoRef])

	const handleSeek = useCallback((time: number) => {
		if (!videoRef?.current) return
		videoRef.current.currentTime = time
		setCurrentTime(time)
	}, [videoRef])

	const handleTimeClick = useCallback((clickTime: number) => {
		if (isSelectingRange) {
			if (rangeStart === null) {
				setRangeStart(clickTime)
				handleSeek(clickTime)
			} else {
				// Create time segment from range
				const startTime = Math.min(rangeStart, clickTime)
				const endTime = Math.max(rangeStart, clickTime)

				const newEffect: TimeSegmentEffect = {
					id: Date.now().toString(),
					startTime,
					endTime,
					muteAudio: false,
					blackScreen: false,
					description: '',
				}

				setEditingEffect(newEffect)
				setIsAddDialogOpen(true)
				setIsSelectingRange(false)
				setRangeStart(null)
			}
		} else {
			handleSeek(clickTime)
		}
	}, [isSelectingRange, rangeStart, handleSeek])

	const handleQuickAddSegment = useCallback(() => {
		if (!videoRef?.current) return

		const startTime = Math.max(0, currentTime - 2) // 2 seconds before
		const endTime = Math.min(mediaDuration || 0, currentTime + 2) // 2 seconds after

		const newEffect: TimeSegmentEffect = {
			id: Date.now().toString(),
			startTime,
			endTime,
			muteAudio: false,
			blackScreen: false,
			description: '',
		}

		setEditingEffect(newEffect)
		setIsAddDialogOpen(true)
	}, [currentTime, mediaDuration, videoRef])

	// Update current time from video
	useEffect(() => {
		if (!videoRef?.current) return

		const video = videoRef.current
		const handleTimeUpdate = () => {
			setCurrentTime(video.currentTime)
			setIsPlaying(!video.paused)
		}

		video.addEventListener('timeupdate', handleTimeUpdate)
		video.addEventListener('play', () => setIsPlaying(true))
		video.addEventListener('pause', () => setIsPlaying(false))

		return () => {
			video.removeEventListener('timeupdate', handleTimeUpdate)
			video.removeEventListener('play', () => setIsPlaying(true))
			video.removeEventListener('pause', () => setIsPlaying(false))
		}
	}, [videoRef])

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Clock className="h-4 w-4" />
					时间段效果
					{effects.length > 0 && (
						<Badge variant="secondary" className="text-xs">
							{effects.length}
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant={isSelectingRange ? "default" : "outline"}
						size="sm"
						onClick={() => {
							setIsSelectingRange(!isSelectingRange)
							setRangeStart(null)
						}}
					>
						<Scissors className="h-4 w-4 mr-1" />
						{isSelectingRange ? '选择中...' : '选择时间段'}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={handleQuickAddSegment}>
						<Plus className="h-4 w-4 mr-1" />
						快速添加
					</Button>
				</div>
			</div>

			{/* Video Timeline */}
			{mediaDuration && mediaDuration > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>时间轴</span>
						<span>{formatTime(currentTime)} / {formatTime(mediaDuration)}</span>
					</div>

					<div className="relative">
						{/* Timeline Track */}
						<div
							className="h-12 bg-muted rounded-lg cursor-pointer relative overflow-hidden"
							onClick={(e) => {
								const rect = e.currentTarget.getBoundingClientRect()
								const clickTime = (e.clientX - rect.left) / rect.width * mediaDuration
								handleTimeClick(clickTime)
							}}
						>
							{/* Time segments */}
							{effects.map((effect) => (
								<div
									key={effect.id}
									className="absolute h-full flex items-center justify-center text-xs text-white font-medium"
									style={{
										left: `${(effect.startTime / mediaDuration) * 100}%`,
										width: `${((effect.endTime - effect.startTime) / mediaDuration) * 100}%`,
									}}
								>
									<div className={`w-full h-full ${
										effect.muteAudio && effect.blackScreen
											? 'bg-purple-500'
											: effect.muteAudio
												? 'bg-red-500'
												: 'bg-gray-800'
									} opacity-80 rounded`} />
								</div>
							))}

							{/* Range selection indicator */}
							{isSelectingRange && rangeStart !== null && (
								<div
									className="absolute h-full bg-blue-400 opacity-50 pointer-events-none"
									style={{
										left: `${(rangeStart / mediaDuration) * 100}%`,
										width: `${Math.abs((currentTime - rangeStart) / mediaDuration) * 100}%`,
									}}
								/>
							)}

							{/* Current time indicator */}
							<div
								className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none"
								style={{
									left: `${(currentTime / mediaDuration) * 100}%`,
								}}
							/>
						</div>

						{/* Video controls */}
						<div className="flex items-center gap-2 mt-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleSeek(Math.max(0, currentTime - 5))}
							>
								<SkipBack className="h-4 w-4" />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handlePlayPause}
							>
								{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleSeek(Math.min(mediaDuration, currentTime + 5))}
							>
								<SkipForward className="h-4 w-4" />
							</Button>
						</div>
					</div>

					{isSelectingRange && (
						<div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
							{rangeStart === null
								? '点击时间轴选择开始时间'
								: `已选择开始时间 ${formatTime(rangeStart)}，点击时间轴选择结束时间`
							}
						</div>
					)}
				</div>
			)}

			{effects.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground text-sm">
					<Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
					暂无时间段效果配置
					<br />
					点击上方按钮添加消音或黑屏效果
				</div>
			) : (
				<div className="space-y-2">
					{effects.map((effect) => (
						<div
							key={effect.id}
							className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
						>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-1">
									<Badge variant="outline" className="text-xs">
										{formatTime(effect.startTime)} - {formatTime(effect.endTime)}
									</Badge>
									{effect.muteAudio && (
										<Badge variant="destructive" className="text-xs">
											<VolumeX className="h-3 w-3 mr-1" />
											消音
										</Badge>
									)}
									{effect.blackScreen && (
										<Badge variant="default" className="text-xs bg-black text-white border-black">
											<EyeOff className="h-3 w-3 mr-1" />
											黑屏
										</Badge>
									)}
								</div>
								{effect.description && (
									<p className="text-xs text-muted-foreground truncate">
										{effect.description}
									</p>
								)}
							</div>
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => handleEditEffect(effect)}
								>
									<Settings className="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => handleDeleteEffect(effect.id)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}

			<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingEffect?.id && effects.find(e => e.id === editingEffect?.id)
								? '编辑时间段效果'
								: '添加时间段效果'}
						</DialogTitle>
					</DialogHeader>
					{editingEffect && (
						<TimeSegmentForm
							effect={editingEffect}
							onChange={setEditingEffect}
							onSave={handleSaveEffect}
							onCancel={() => {
								setIsAddDialogOpen(false)
								setEditingEffect(null)
							}}
							mediaDuration={mediaDuration}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}

interface TimeSegmentFormProps {
	effect: TimeSegmentEffect
	onChange: (effect: TimeSegmentEffect) => void
	onSave: (effect: TimeSegmentEffect) => void
	onCancel: () => void
	mediaDuration?: number
}

function TimeSegmentForm({ effect, onChange, onSave, onCancel, mediaDuration }: TimeSegmentFormProps) {
	const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
		const seconds = parseTimeString(value)
		if (!isNaN(seconds)) {
			onChange({ ...effect, [field]: seconds })
		}
	}

	const parseTimeString = (timeStr: string): number => {
		const parts = timeStr.split(':')
		if (parts.length === 2) {
			const mins = parseInt(parts[0], 10)
			const secs = parseInt(parts[1], 10)
			if (!isNaN(mins) && !isNaN(secs)) {
				return mins * 60 + secs
			}
		}
		return 0
	}

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	const handleSave = () => {
		if (effect.startTime < effect.endTime) {
			onSave(effect)
		}
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1.5">
					<Label htmlFor="start-time">开始时间</Label>
					<Input
						id="start-time"
						type="text"
						placeholder="0:00"
						value={formatTime(effect.startTime)}
						onChange={(e) => handleTimeChange('startTime', e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="end-time">结束时间</Label>
					<Input
						id="end-time"
						type="text"
						placeholder="0:10"
						value={formatTime(effect.endTime)}
						onChange={(e) => handleTimeChange('endTime', e.target.value)}
					/>
				</div>
			</div>

			{mediaDuration && (
				<div className="text-xs text-muted-foreground">
					视频总时长: {formatTime(mediaDuration)}
				</div>
			)}

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<VolumeX className="h-4 w-4" />
						<Label htmlFor="mute-audio" className="text-sm">消音</Label>
					</div>
					<Switch
						id="mute-audio"
						checked={effect.muteAudio}
						onCheckedChange={(checked) => onChange({ ...effect, muteAudio: checked })}
					/>
				</div>

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<EyeOff className="h-4 w-4" />
						<Label htmlFor="black-screen" className="text-sm">黑屏</Label>
					</div>
					<Switch
						id="black-screen"
						checked={effect.blackScreen}
						onCheckedChange={(checked) => onChange({ ...effect, blackScreen: checked })}
					/>
				</div>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="description">描述 (可选)</Label>
				<Textarea
					id="description"
					placeholder="添加描述..."
					value={effect.description || ''}
					onChange={(e) => onChange({ ...effect, description: e.target.value })}
					rows={2}
				/>
			</div>

			<div className="flex gap-2 pt-2">
				<Button onClick={handleSave} disabled={effect.startTime >= effect.endTime}>
					保存
				</Button>
				<Button variant="outline" onClick={onCancel}>
					取消
				</Button>
			</div>
		</div>
	)
}