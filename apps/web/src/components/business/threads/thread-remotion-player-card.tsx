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
	templateId?: string | null
	templateConfig?: unknown | null
}

type DbThreadPost = {
	id: string
	authorName: string
	authorHandle?: string | null
	authorAvatarAssetId?: string | null
	contentBlocks: any[]
	plainText: string
	translations?: ThreadVideoInputProps['root']['translations'] | null
	createdAt?: Date | null
	metrics?: { likes?: number | null } | null
}

function toIso(input?: Date | null): string | null {
	if (!input) return null
	const d = input instanceof Date ? input : new Date(input)
	if (Number.isNaN(d.getTime())) return null
	return d.toISOString()
}

export type ThreadRemotionPlayerCardProps = {
	thread: DbThread | null
	root: DbThreadPost | null
	replies: DbThreadPost[]
	isLoading: boolean
	assets?: Array<{
		id: string
		kind: string
		sourceUrl?: string | null
		renderUrl?: string | null
	}>
	audio?: { url: string; durationMs: number } | null
	templateId?: ThreadTemplateId
	templateConfig?: ThreadVideoInputProps['templateConfig'] | null
}

export function ThreadRemotionPlayerCard({
	thread,
	root,
	replies,
	isLoading,
	assets = [],
	audio = null,
	templateId,
	templateConfig,
}: ThreadRemotionPlayerCardProps) {
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

	const effectiveTemplateId = React.useMemo(() => {
		if (templateId) return templateId
		const fromThread = thread?.templateId
		return (fromThread as ThreadTemplateId | null) ?? DEFAULT_THREAD_TEMPLATE_ID
	}, [templateId, thread?.templateId])

	const effectiveTemplateConfig = React.useMemo(() => {
		if (templateConfig !== undefined) return templateConfig
		const fromThread = thread?.templateConfig
		return (fromThread ?? undefined) as any
	}, [templateConfig, thread?.templateConfig])

	const inputProps: ThreadVideoInputProps | undefined = React.useMemo(() => {
		if (!thread || !root) return undefined

		const assetsMap: ThreadVideoInputProps['assets'] = {}
		for (const a of assets) {
			const url = a?.renderUrl
			if (!a?.id || !url) continue
			assetsMap[String(a.id)] = {
				id: String(a.id),
				kind: (a.kind as any) ?? 'image',
				url: String(url),
			}
		}

		return {
			thread: {
				title: thread.title,
				source: thread.source,
				sourceUrl: thread.sourceUrl ?? null,
			},
			audio: audio ?? undefined,
			root: {
				id: root.id,
				author: {
					name: root.authorName,
					handle: root.authorHandle ?? null,
					avatarAssetId: root.authorAvatarAssetId ?? null,
				},
				contentBlocks: (root.contentBlocks ?? []) as any,
				plainText: root.plainText,
				translations: root.translations ?? null,
				createdAt: toIso(root.createdAt),
				metrics: { likes: Number(root.metrics?.likes ?? 0) || 0 },
			},
			replies: replies.map((r) => ({
				id: r.id,
				author: {
					name: r.authorName,
					handle: r.authorHandle ?? null,
					avatarAssetId: r.authorAvatarAssetId ?? null,
				},
				contentBlocks: (r.contentBlocks ?? []) as any,
				plainText: r.plainText,
				translations: r.translations ?? null,
				createdAt: toIso(r.createdAt),
				metrics: { likes: Number(r.metrics?.likes ?? 0) || 0 },
			})),
			assets: Object.keys(assetsMap).length > 0 ? assetsMap : undefined,
			coverDurationInFrames: timeline.coverDurationInFrames,
			replyDurationsInFrames: timeline.commentDurationsInFrames,
			fps: REMOTION_FPS,
			templateConfig: effectiveTemplateConfig ?? undefined,
		}
	}, [
		audio,
		assets,
		effectiveTemplateConfig,
		replies,
		root,
		thread,
		timeline.commentDurationsInFrames,
		timeline.coverDurationInFrames,
	])

	const template = getThreadTemplate(effectiveTemplateId)
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
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="font-mono text-[10px] text-muted-foreground">
								{template.name} · {template.compositionWidth}×
								{template.compositionHeight}
							</div>
						</div>

						{(() => {
							const ratio =
								template.compositionHeight / template.compositionWidth
							return (
								<div
									style={{
										position: 'relative',
										width: '100%',
										paddingBottom: `${ratio * 100}%`,
										overflow: 'hidden',
										borderRadius: 0,
										border: '1px solid hsl(var(--border))',
									}}
								>
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
												clickToPlay
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
