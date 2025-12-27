'use client'

import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { PlayerPropsWithoutZod } from '@remotion/player'
import {
	DEFAULT_THREAD_TEMPLATE_ID,
	getThreadTemplate,
	type ThreadTemplateId,
} from '@app/remotion-project/thread-templates'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import { AlertCircle, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'

const LazyPlayer = React.lazy(async () => {
	const mod = await import('@remotion/player')
	return { default: mod.Player }
}) as unknown as React.LazyExoticComponent<
	React.ComponentType<PlayerPropsWithoutZod<ThreadVideoInputProps>>
>

type DbThread = {
	id: string
	title: string
	source: string
	sourceUrl?: string | null
}

type DbThreadPost = {
	id: string
	authorName: string
	authorHandle?: string | null
	contentBlocks: any[]
	plainText: string
	createdAt?: Date | null
	metrics?: { likes?: number | null } | null
}

function toIso(input?: Date | null): string | null {
	if (!input) return null
	const d = input instanceof Date ? input : new Date(input)
	if (Number.isNaN(d.getTime())) return null
	return d.toISOString()
}

export function ThreadRemotionPreviewCard({
	thread,
	root,
	replies,
	isLoading,
	templateId = DEFAULT_THREAD_TEMPLATE_ID,
}: {
	thread: DbThread | null
	root: DbThreadPost | null
	replies: DbThreadPost[]
	isLoading: boolean
	templateId?: ThreadTemplateId
}) {
	const isClient = typeof window !== 'undefined'

	const timeline = React.useMemo(() => {
		const commentsForTiming = replies.map((r) => ({
			id: r.id,
			author: r.authorName,
			content: r.plainText,
			likes: Number(r.metrics?.likes ?? 0) || 0,
			replyCount: 0,
		}))
		return buildCommentTimeline(commentsForTiming, REMOTION_FPS)
	}, [replies])

	const inputProps: ThreadVideoInputProps | undefined = React.useMemo(() => {
		if (!thread || !root) return undefined
		return {
			thread: {
				title: thread.title,
				source: thread.source,
				sourceUrl: thread.sourceUrl ?? null,
			},
			root: {
				id: root.id,
				author: { name: root.authorName, handle: root.authorHandle ?? null },
				contentBlocks: (root.contentBlocks ?? []) as any,
				plainText: root.plainText,
				createdAt: toIso(root.createdAt),
				metrics: { likes: Number(root.metrics?.likes ?? 0) || 0 },
			},
			replies: replies.map((r) => ({
				id: r.id,
				author: { name: r.authorName, handle: r.authorHandle ?? null },
				contentBlocks: (r.contentBlocks ?? []) as any,
				plainText: r.plainText,
				createdAt: toIso(r.createdAt),
				metrics: { likes: Number(r.metrics?.likes ?? 0) || 0 },
			})),
			coverDurationInFrames: timeline.coverDurationInFrames,
			replyDurationsInFrames: timeline.commentDurationsInFrames,
			fps: REMOTION_FPS,
		}
	}, [replies, root, thread, timeline.commentDurationsInFrames, timeline.coverDurationInFrames])

	const template = getThreadTemplate(templateId)
	const TemplateComponent = template.component

	return (
		<Card className="shadow-sm rounded-none">
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-[240px] w-full rounded-none" />
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading…
						</div>
					</div>
				) : !thread || !root ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-none border border-dashed border-border/60 bg-muted/20 p-8 text-center">
						<AlertCircle className="h-6 w-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							Thread data is required to generate a preview.
						</p>
					</div>
				) : !isClient ? (
					<div className="flex items-center justify-center h-[240px] w-full bg-muted/40 rounded-none">
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
								borderRadius: 0,
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
