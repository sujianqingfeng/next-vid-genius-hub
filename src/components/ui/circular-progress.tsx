'use client'

import { cn } from '~/lib/utils'

type Props = {
	/** 0..100 */
	value?: number
	size?: number
	strokeWidth?: number
	className?: string
	trackClassName?: string
	indicatorClassName?: string
}

export function CircularProgress({
	value = 0,
	size = 18,
	strokeWidth = 2.5,
	className,
	trackClassName,
	indicatorClassName,
}: Props) {
	const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
	const radius = (size - strokeWidth) / 2
	const circumference = 2 * Math.PI * radius
	const dashOffset = circumference - (clamped / 100) * circumference

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={cn('shrink-0', className)}
			aria-hidden="true"
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				strokeWidth={strokeWidth}
				className={cn('stroke-foreground/15', trackClassName)}
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={dashOffset}
				className={cn(
					'stroke-primary transition-[stroke-dashoffset]',
					indicatorClassName,
				)}
				style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }}
			/>
		</svg>
	)
}
