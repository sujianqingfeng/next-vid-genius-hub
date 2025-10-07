'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { AlertCircle, Loader2, Play } from 'lucide-react'
import type { PlayerPropsWithoutZod } from '@remotion/player'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import type { Comment, VideoInfo } from '~/lib/media/types'
import { Badge } from '~/components/ui/badge'
import type { CommentVideoInputProps, TimelineDurations } from '~/remotion/types'
import { CommentsVideo } from '~/remotion/CommentsVideo'

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

const FPS = 30
const COVER_DURATION_SECONDS = 3
const MIN_COMMENT_DURATION_SECONDS = 4
const MAX_COMMENT_DURATION_SECONDS = 20

interface RemotionPreviewCardProps {
	videoInfo?: (Partial<VideoInfo> & { translatedTitle?: string | null }) | null
	comments: Comment[]
	isLoading: boolean
	onRender?: () => void
	onRenderLabel?: string
	isRenderPending?: boolean
}

const chineseCharRegex = /[\u4e00-\u9fff]/

function weightByLanguage(text?: string | null, baseWeight = 1): number {
	if (!text) return 0
	const hasChinese = chineseCharRegex.test(text)
	// 中文字号更大、每行容纳字符更少，权重更高
	return text.length * baseWeight * (hasChinese ? 2.2 : 1.0)
}

function estimateCommentDurationSeconds(comment: Comment): number {
	const baseSeconds = 3.5
	const mainWeight = weightByLanguage(comment.content, 1.0)
	const transWeight = weightByLanguage(comment.translatedContent, 1.2)
	const weightedChars = mainWeight + transWeight
	// 较温和的时间增长系数，避免爆炸增长
	const additionalSeconds = weightedChars / 18
	const estimated = baseSeconds + additionalSeconds
	return Math.min(
		MAX_COMMENT_DURATION_SECONDS,
		Math.max(MIN_COMMENT_DURATION_SECONDS, estimated),
	)
}

function buildTimeline(comments: Comment[]): TimelineDurations {
	const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * FPS)
	const commentDurationsInFrames = comments.map((comment) => {
		const seconds = estimateCommentDurationSeconds(comment)
		return Math.round(seconds * FPS)
	})
	const totalDurationInFrames =
		coverDurationInFrames +
		commentDurationsInFrames.reduce((sum, frames) => sum + frames, 0)
	const totalDurationSeconds = totalDurationInFrames / FPS
	return {
		coverDurationInFrames,
		commentDurationsInFrames,
		totalDurationInFrames,
		totalDurationSeconds,
		coverDurationSeconds: COVER_DURATION_SECONDS,
	}
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
}: RemotionPreviewCardProps) {
	const mediaInfo = useMemo(() => mapVideoInfo(videoInfo), [videoInfo])
	const timeline = useMemo(() => buildTimeline(comments), [comments])

	const inputProps: CommentVideoInputProps | undefined = useMemo(() => {
		if (!mediaInfo || comments.length === 0) {
			return undefined
		}

		return {
			videoInfo: mediaInfo,
			comments,
			coverDurationInFrames: timeline.coverDurationInFrames,
			commentDurationsInFrames: timeline.commentDurationsInFrames,
			fps: FPS,
		}
	}, [comments, mediaInfo, timeline])

	return (
		<Card className="shadow-sm">
			<CardHeader className="pb-2">
				<CardTitle className="text-lg">Preview</CardTitle>
				<CardDescription>Remotion overlay before kicking off rendering.</CardDescription>
			</CardHeader>
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
						<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
							<Player
								component={CommentsVideo}
								inputProps={inputProps}
								durationInFrames={timeline.totalDurationInFrames}
								compositionWidth={1920}
								compositionHeight={1080}
								fps={FPS}
								controls
								loop
								style={{ width: '100%', height: '100%', backgroundColor: '#0b1120' }}
							/>
						</div>
						<div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
							<Badge variant="outline" className="font-medium">
								{comments.length} comment{comments.length === 1 ? '' : 's'}
							</Badge>
							<span>
								{timeline.totalDurationSeconds.toFixed(1)}s total · cover {(
									timeline.coverDurationSeconds
								).toFixed(1)}s
							</span>
						</div>
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
