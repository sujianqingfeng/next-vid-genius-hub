'use client'

import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { PlayerPropsWithoutZod } from '@remotion/player'
import {
	DEFAULT_TEMPLATE_ID,
	getTemplate,
	type RemotionTemplateId,
} from '@app/remotion-project/templates'
import type {
	CommentVideoInputProps,
	CommentsTemplateConfig,
} from '@app/remotion-project/types'
import { AlertCircle, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { useTranslations } from '~/lib/i18n'
import type { Comment, VideoInfo } from '~/lib/media/types'

const LazyPlayer = React.lazy(async () => {
	const mod = await import('@remotion/player')
	return { default: mod.Player }
}) as unknown as React.LazyExoticComponent<
	React.ComponentType<PlayerPropsWithoutZod<CommentVideoInputProps>>
>

interface RemotionPreviewCardStartProps {
	videoInfo?: (Partial<VideoInfo> & { translatedTitle?: string | null }) | null
	comments: Comment[]
	isLoading: boolean
	templateId?: RemotionTemplateId
	templateConfig?: CommentsTemplateConfig
}

function mapVideoInfo(
	input?: (Partial<VideoInfo> & { translatedTitle?: string | null }) | null,
): VideoInfo | undefined {
	if (!input || !input.title) return undefined
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

export function RemotionPreviewCardStart({
	videoInfo,
	comments,
	isLoading,
	templateId = DEFAULT_TEMPLATE_ID,
	templateConfig,
}: RemotionPreviewCardStartProps) {
	const t = useTranslations('MediaComments.page.preview')
	const isClient = typeof window !== 'undefined'
	const mediaInfo = React.useMemo(() => mapVideoInfo(videoInfo), [videoInfo])
	const timeline = React.useMemo(
		() => buildCommentTimeline(comments, REMOTION_FPS),
		[comments],
	)

	const inputProps: CommentVideoInputProps | undefined = React.useMemo(() => {
		if (!mediaInfo || comments.length === 0) return undefined
		return {
			videoInfo: mediaInfo,
			comments,
			coverDurationInFrames: timeline.coverDurationInFrames,
			commentDurationsInFrames: timeline.commentDurationsInFrames,
			fps: REMOTION_FPS,
			templateConfig,
		}
	}, [comments, mediaInfo, templateConfig, timeline])

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
							{t('loading')}
						</div>
					</div>
				) : !mediaInfo ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-8 text-center">
						<AlertCircle className="h-6 w-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							{t('empty.mediaMissing')}
						</p>
					</div>
				) : comments.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center">
						<p className="text-sm font-medium">{t('empty.noComments.title')}</p>
						<p className="text-xs text-muted-foreground">
							{t('empty.noComments.body')}
						</p>
					</div>
				) : !isClient ? (
					<div className="flex items-center justify-center h-[240px] w-full bg-muted/40 rounded-lg">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : inputProps ? (
					<div className="space-y-3">
						{(() => {
							const ratio =
								template.compositionHeight / template.compositionWidth
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
										<React.Suspense
											fallback={
												<div className="flex items-center justify-center h-full w-full bg-muted/40">
													<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
												</div>
											}
										>
											<LazyPlayer
												component={TemplateComponent}
												inputProps={inputProps}
												durationInFrames={timeline.totalDurationInFrames}
												compositionWidth={template.compositionWidth}
												compositionHeight={template.compositionHeight}
												fps={REMOTION_FPS}
												controls
												loop
												style={{
													width: '100%',
													height: '100%',
													backgroundColor: '#0b1120',
												}}
											/>
										</React.Suspense>
									</div>
								</div>
							)
						})()}
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}
