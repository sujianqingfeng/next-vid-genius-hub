'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useTranslations } from '~/lib/shared/i18n'
import { formatTimeForDisplay } from '~/lib/features/subtitle/utils/time'

interface TimelineSelectorProps {
	startTime: number
	endTime: number
	duration: number
	existingSegments?: Array<{ startTime: number; endTime: number; id: string }>
	onChange: (startTime: number, endTime: number) => void
	onPlayPreview?: (time: number) => void
}

/**
 * 时间轴选择器组件
 * 提供可视化时间轴选择和精确时间输入
 */
export function TimelineSelector({
	startTime,
	endTime,
	duration,
	existingSegments = [],
	onChange,
	onPlayPreview,
}: TimelineSelectorProps) {
	const t = useTranslations('Subtitles.ui.timeline')
	const [isDragging, setIsDragging] = useState<
		'start' | 'end' | 'segment' | null
	>(null)
	const [dragStartX, setDragStartX] = useState(0)
	const [dragStartTime, setDragStartTime] = useState(0)
	const [dragEndTime, setDragEndTime] = useState(0)
	const timelineRef = useRef<HTMLDivElement>(null)
	// 当前选中时间段元素，用来判断点击是否发生在选区内部
	const segmentRef = useRef<HTMLDivElement>(null)

	// 将时间转换为像素位置
	const timeToPosition = (time: number) => {
		return (time / duration) * 100
	}

	// 将像素位置转换为时间
	const positionToTime = (position: number) => {
		return Math.max(0, Math.min(duration, (position / 100) * duration))
	}

	// 处理鼠标按下事件
	const handleMouseDown = (
		e: React.MouseEvent,
		type: 'start' | 'end' | 'segment',
	) => {
		e.preventDefault()
		const rect = timelineRef.current?.getBoundingClientRect()
		if (!rect) return

		setIsDragging(type)
		setDragStartX(e.clientX)
		setDragStartTime(startTime)
		setDragEndTime(endTime)
	}

	// 处理鼠标移动事件
	useEffect(() => {
		if (!isDragging || !timelineRef.current || duration <= 0) return

		const handleMouseMove = (e: MouseEvent) => {
			const rect = timelineRef.current?.getBoundingClientRect()
			if (!rect) return

			const deltaX = e.clientX - dragStartX
			const deltaTime = (deltaX / rect.width) * duration

			let newStartTime = dragStartTime
			let newEndTime = dragEndTime

			switch (isDragging) {
				case 'start':
					newStartTime = Math.max(
						0,
						Math.min(dragEndTime - 0.5, dragStartTime + deltaTime),
					)
					break
				case 'end':
					newEndTime = Math.min(
						duration,
						Math.max(dragStartTime + 0.5, dragEndTime + deltaTime),
					)
					break
				case 'segment':
					const segmentDelta = deltaTime
					if (
						dragStartTime + segmentDelta >= 0 &&
						dragEndTime + segmentDelta <= duration
					) {
						newStartTime = dragStartTime + segmentDelta
						newEndTime = dragEndTime + segmentDelta
					}
					break
			}

			onChange(newStartTime, newEndTime)
		}

		const handleMouseUp = () => {
			setIsDragging(null)
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [isDragging, dragStartX, dragStartTime, dragEndTime, duration, onChange])

	// 处理时间轴点击事件
	const handleTimelineClick = (e: React.MouseEvent) => {
		if (isDragging || duration <= 0) return

		// 如果点击发生在当前选中的蓝色时间段内部（包括两侧手柄），交互完全由拖动负责，
		// 此处不再触发“点击移动整个时间段”的逻辑，避免拖动结束时出现突然位移
		if (segmentRef.current && segmentRef.current.contains(e.target as Node)) {
			return
		}

		const rect = timelineRef.current?.getBoundingClientRect()
		if (!rect) return

		const clickPosition = ((e.clientX - rect.left) / rect.width) * 100
		const clickTime = positionToTime(clickPosition)

		// 如果点击在时间段内，移动整个时间段
		if (clickTime >= startTime && clickTime <= endTime) {
			const segmentDuration = endTime - startTime
			const newStartTime = Math.max(
				0,
				Math.min(duration - segmentDuration, clickTime - segmentDuration / 2),
			)
			const newEndTime = newStartTime + segmentDuration
			onChange(newStartTime, newEndTime)
		} else {
			// 否则创建新的时间段
			const newStartTime = Math.max(0, Math.min(duration - 1, clickTime - 0.5))
			const newEndTime = Math.min(duration, Math.max(1, clickTime + 0.5))
			onChange(newStartTime, newEndTime)
		}
	}

	// 检查时间冲突
	const getConflicts = () => {
		return existingSegments.filter(
			(segment) =>
				segment.id !== 'current' &&
				((startTime >= segment.startTime && startTime < segment.endTime) ||
					(endTime > segment.startTime && endTime <= segment.endTime) ||
					(startTime <= segment.startTime && endTime >= segment.endTime)),
		)
	}

	const conflicts = getConflicts()

	// 处理精确时间输入
	const handleTimeInputChange = (field: 'start' | 'end', value: string) => {
		const numValue = parseFloat(value)
		if (isNaN(numValue)) return

		if (field === 'start') {
			const newStart = Math.max(0, Math.min(endTime - 0.1, numValue))
			onChange(newStart, endTime)
		} else {
			const newEnd = Math.min(duration, Math.max(startTime + 0.1, numValue))
			onChange(startTime, newEnd)
		}
	}

	const renderPreciseInput = (kind: 'start' | 'end') => {
		const inputId = `${kind}-time-precise`
		const value = kind === 'start' ? startTime : endTime
		const label = kind === 'start' ? t('inputs.startTime') : t('inputs.endTime')
		return (
			<div className="space-y-2" key={kind}>
				<Label htmlFor={inputId}>{label}</Label>
				<div className="flex items-center gap-2">
					<Input
						id={inputId}
						type="number"
						min={0}
						max={duration}
						step={0.1}
						value={value.toFixed(1)}
						onChange={(e) => handleTimeInputChange(kind, e.target.value)}
						className="flex-1"
					/>
					{onPlayPreview && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPlayPreview(value)}
							className="whitespace-nowrap"
						>
							<Clock className="h-3 w-3 mr-1" />
							{t('actions.preview')}
						</Button>
					)}
				</div>
				<div className="text-xs text-gray-500">
					{formatTimeForDisplay(value)}
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* 时间轴 */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-sm font-medium">{t('title')}</Label>
					<div className="flex items-center gap-2">
						{duration <= 0 && (
							<Badge variant="outline" className="text-xs">
								{t('badges.loadingDuration')}
							</Badge>
						)}
						{conflicts.length > 0 && (
							<Badge variant="destructive" className="text-xs">
								<AlertTriangle className="h-3 w-3 mr-1" />
								{t('badges.conflicts', { count: conflicts.length })}
							</Badge>
						)}
					</div>
				</div>

				<div
					ref={timelineRef}
					className={`relative h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden ${
						duration > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
					}`}
					onClick={duration > 0 ? handleTimelineClick : undefined}
				>
					{/* 背景网格 */}
					<div className="absolute inset-0 flex">
						{Array.from({ length: 10 }, (_, i) => (
							<div
								key={i}
								className="flex-1 border-r border-gray-200 dark:border-gray-700"
								style={{ left: `${i * 10}%` }}
							/>
						))}
					</div>

					{/* 现有时间段 */}
					{existingSegments.map((segment) => (
						<div
							key={segment.id}
							className="absolute top-1 bottom-1 bg-orange-200 dark:bg-orange-800 opacity-50 rounded"
							style={{
								left: `${timeToPosition(segment.startTime)}%`,
								width: `${timeToPosition(segment.endTime - segment.startTime)}%`,
							}}
						/>
					))}

					{/* 当前选择的时间段 */}
					{duration > 0 && (
						<div
							className={`absolute top-1 bottom-1 bg-blue-500 rounded transition-opacity ${
								conflicts.length > 0 ? 'opacity-70' : 'opacity-90'
							} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
							ref={segmentRef}
							style={{
								left: `${timeToPosition(startTime)}%`,
								width: `${timeToPosition(endTime - startTime)}%`,
							}}
							onMouseDown={(e) => handleMouseDown(e, 'segment')}
						>
							{/* 左侧手柄 */}
							<div
								className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-blue-600 hover:bg-opacity-50 z-10"
								onMouseDown={(e) => {
									e.stopPropagation()
									handleMouseDown(e, 'start')
								}}
							/>

							{/* 右侧手柄 */}
							<div
								className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-blue-600 hover:bg-opacity-50 z-10"
								onMouseDown={(e) => {
									e.stopPropagation()
									handleMouseDown(e, 'end')
								}}
							/>
						</div>
					)}

					{/* 时间标签 */}
					<div className="absolute top-0 left-0 right-0 flex justify-between text-xs text-gray-600 dark:text-gray-400 px-1">
						<span>0:00</span>
						<span>{formatTimeForDisplay(duration / 2)}</span>
						<span>{formatTimeForDisplay(duration)}</span>
					</div>
				</div>
			</div>

			{/* 精确时间输入 */}
			<div className="grid grid-cols-2 gap-4">
				{(['start', 'end'] as const).map(renderPreciseInput)}
			</div>

			{/* 时间段信息 */}
			<div className="text-sm text-gray-600 dark:text-gray-400">
				{t('durationLabel')}{' '}
				<span className="font-medium">
					{formatTimeForDisplay(endTime - startTime)}
				</span>
				{conflicts.length > 0 && (
					<div className="text-red-600 dark:text-red-400 mt-1">
						⚠️ {t('conflictsHint')}
					</div>
				)}
			</div>
		</div>
	)
}
