// Inline lucide "thumbs-up" so the skill has no lucide-react dependency.
// Path data matches lucide-react's ThumbsUp; accepts the props the template uses.
import type * as React from 'react'

export const ThumbsUp: React.FC<{
	size?: number
	strokeWidth?: number
	color?: string
}> = ({ size = 24, strokeWidth = 2, color = 'currentColor' }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={color}
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M7 10v12" />
		<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
	</svg>
)
