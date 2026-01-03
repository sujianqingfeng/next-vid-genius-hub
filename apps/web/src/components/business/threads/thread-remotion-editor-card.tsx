'use client'

import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import type {
	ThumbnailMethods,
	ThumbnailPropsWithoutZod,
} from '@remotion/player'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

const LazyThumbnail = React.lazy(async () => {
	const mod = await import('@remotion/player')
	return { default: mod.Thumbnail }
}) as unknown as React.LazyExoticComponent<
	React.ComponentType<ThumbnailPropsWithoutZod<ThreadVideoInputProps>>
>

export type ThreadRemotionEditorCardProps = {
	component: React.ComponentType<any>
	inputProps: ThreadVideoInputProps
	frameToDisplay: number
	durationInFrames: number
	compositionWidth: number
	compositionHeight: number
	fps: number
	style?: React.CSSProperties
}

export const ThreadRemotionEditorCard = React.forwardRef<
	ThumbnailMethods,
	ThreadRemotionEditorCardProps
>(
	(
		{
			component,
			inputProps,
			frameToDisplay,
			durationInFrames,
			compositionWidth,
			compositionHeight,
			fps,
			style,
		},
		ref,
	) => {
		return (
			<React.Suspense
				fallback={
					<div className="flex items-center justify-center h-full w-full bg-muted/40">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				}
			>
				<LazyThumbnail
					ref={ref as any}
					component={component as any}
					inputProps={inputProps}
					frameToDisplay={frameToDisplay}
					durationInFrames={durationInFrames}
					compositionWidth={compositionWidth}
					compositionHeight={compositionHeight}
					fps={fps}
					style={style}
				/>
			</React.Suspense>
		)
	},
)

ThreadRemotionEditorCard.displayName = 'ThreadRemotionEditorCard'
