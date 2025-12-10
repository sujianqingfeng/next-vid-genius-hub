'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { AlertCircle, Loader2, Play } from 'lucide-react'
import type { PlayerPropsWithoutZod } from '@remotion/player'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardFooter } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import type { Comment, VideoInfo } from '~/lib/media/types'
import { DEFAULT_TEMPLATE_ID, getTemplate, type RemotionTemplateId } from '~/remotion/templates'

import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { CommentVideoInputProps } from '~/remotion/types'

const Player = dynamic<PlayerPropsWithoutZod<CommentVideoInputProps>>(
	() => import('@remotion/player').then((mod) => mod.Player),
{
	ssr: false,
	loading: () => (
		<div className="flex items-center justify-center h-[240px] w-full bg-muted/40 rounded-lg">
			<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	),
},
)

interface RemotionPreviewCardProps {
	videoInfo?: (Partial<VideoInfo> & { translatedTitle?: string | null }) | null
	comments: Comment[]
	isLoading: boolean
	onRender?: () => void
	onRenderLabel?: string
	isRenderPending?: boolean
  templateId?: RemotionTemplateId
}

function mapVideoInfo(
	input?: (Partial<VideoInfo> & { translatedTitle?: string | null }) | null,
): VideoInfo | undefined {
	if (!input || !input.title) {
		return undefined
	}

	return {
		title: input.title,
		translatedTitle: input.translatedTitle ?? undefined,
		viewCount: input.viewCount ?? 0,
		author: input.author ?? undefined,
		thumbnail: input.thumbnail ?? undefined,
		series: input.series ?? undefined,
		seriesEpisode: input.seriesEpisode ?? undefined,
	}
}

export function RemotionPreviewCard({
	videoInfo,
	comments,
	isLoading,
	onRender,
	onRenderLabel = 'Render',
	isRenderPending,
  templateId = DEFAULT_TEMPLATE_ID,
}: RemotionPreviewCardProps) {
	const mediaInfo = useMemo(() => mapVideoInfo(videoInfo), [videoInfo])
	const timeline = useMemo(
		() => buildCommentTimeline(comments, REMOTION_FPS),
		[comments],
	)

	const inputProps: CommentVideoInputProps | undefined = useMemo(() => {
		if (!mediaInfo || comments.length === 0) {
			return undefined
		}

		return {
			videoInfo: mediaInfo,
			comments,
			coverDurationInFrames: timeline.coverDurationInFrames,
			commentDurationsInFrames: timeline.commentDurationsInFrames,
			fps: REMOTION_FPS,
		}
	}, [comments, mediaInfo, timeline])

	const template = getTemplate(templateId)
	const TemplateComponent = template.component

	return (
		<Card className="shadow-sm">
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-[240px] w-full rounded-lg" />
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading media metadata…
						</div>
					</div>
				) : !mediaInfo ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-8 text-center">
						<AlertCircle className="h-6 w-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							Media details are required to generate a preview.
						</p>
					</div>
				) : comments.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center">
						<MessagePlaceholder />
					</div>
				) : inputProps ? (
					<div className="space-y-3">
						{(() => {
							const ratio = template.compositionHeight / template.compositionWidth
							const wrapperStyle: React.CSSProperties = {
								position: 'relative',
								width: '100%',
								paddingBottom: `${ratio * 100}%`,
								overflow: 'hidden',
								borderRadius: '0.5rem',
								border: '1px solid hsl(var(--border))',
							}
							return (
								<div style={wrapperStyle}>
									<div style={{ position: 'absolute', inset: 0 }}>
							<Player
								component={TemplateComponent}
								inputProps={inputProps}
								durationInFrames={timeline.totalDurationInFrames}
							compositionWidth={template.compositionWidth}
							compositionHeight={template.compositionHeight}
							fps={REMOTION_FPS}
								controls
								loop
								style={{ width: '100%', height: '100%', backgroundColor: '#0b1120' }}
							/>
								</div>
								</div>
							)
						})()}
						
					</div>
				) : null}
			</CardContent>
			{onRender && (
				<CardFooter className="flex justify-end">
					<Button onClick={onRender} disabled={isRenderPending}>
						{isRenderPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Processing…
							</>
						) : (
							<>
								<Play className="mr-2 h-4 w-4" />
								{onRenderLabel}
							</>
						)}
					</Button>
				</CardFooter>
			)}
		</Card>
	)
}

function MessagePlaceholder() {
	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">No comments to preview yet</p>
			<p className="text-xs text-muted-foreground">
				Download or translate comments to unlock the Remotion preview.
			</p>
		</div>
	)
}
