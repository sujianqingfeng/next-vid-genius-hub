import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { ThreadRemotionPreviewCard } from '~/components/business/threads/thread-remotion-preview-card'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/threads/$id/')({
	component: ThreadDetailRoute,
})

function toPrettyJson(value: unknown): string {
	try {
		return JSON.stringify(
			value,
			(_k, v) => (typeof v === 'bigint' ? v.toString() : v),
			2,
		)
	} catch (e) {
		return e instanceof Error ? e.message : String(e)
	}
}

function firstTextBlockText(blocks: any[] | null | undefined): string {
	const b = blocks?.find((x) => x && x.type === 'text')
	if (!b) return ''
	return String(b.data?.text ?? '')
}

function ThreadDetailRoute() {
	const { id } = Route.useParams()
	const qc = useQueryClient()

	const dataQuery = useQuery(queryOrpc.thread.byId.queryOptions({ input: { id } }))
	const thread = dataQuery.data?.thread ?? null
	const root = dataQuery.data?.root ?? null
	const replies = dataQuery.data?.replies ?? []
	const assets = dataQuery.data?.assets ?? []

	const [selectedPostId, setSelectedPostId] = React.useState<string | null>(null)
	React.useEffect(() => {
		if (!selectedPostId && root?.id) setSelectedPostId(root.id)
	}, [root?.id, selectedPostId])

	const selectedPost =
		(selectedPostId &&
			([root, ...replies].find((p) => p?.id === selectedPostId) ?? null)) ||
		null

	const selectedPostJson = React.useMemo(
		() => (selectedPost ? toPrettyJson(selectedPost) : ''),
		[selectedPost],
	)
	const threadJson = React.useMemo(() => (thread ? toPrettyJson(thread) : ''), [thread])
	const assetsById = React.useMemo(() => {
		const m = new Map<string, any>()
		for (const a of assets) m.set(String(a.id), a)
		return m
	}, [assets])

	const [draftText, setDraftText] = React.useState('')
	React.useEffect(() => {
		setDraftText(firstTextBlockText(selectedPost?.contentBlocks) || '')
	}, [selectedPostId])

	const updateMutation = useEnhancedMutation(
		queryOrpc.thread.updatePostText.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: 'Saved',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const ingestAssetsMutation = useEnhancedMutation(
		queryOrpc.thread.ingestAssets.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: ({ data }) =>
				`Media ingest: processed=${data.processed} ok=${data.succeeded} failed=${data.failed}`,
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	// ---------- Cloud render ----------
	const {
		jobId: renderJobId,
		setJobId: setRenderJobId,
		statusQuery: renderStatusQuery,
	} = useCloudJob<any, Error>({
		storageKey: `threadRenderJob:${id}`,
		enabled: true,
		completeStatuses: ['completed', 'failed', 'canceled'],
		autoClearOnComplete: false,
		createQueryOptions: (jobId) =>
			queryOrpc.thread.getCloudRenderStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: any } }) => {
					const s = q.state.data?.status
					if (s === 'completed' || s === 'failed' || s === 'canceled') return false
					return 2000
				},
			}),
	})

	const startRenderMutation = useEnhancedMutation(
		queryOrpc.thread.startCloudRender.mutationOptions({
			onSuccess: (data) => setRenderJobId(data.jobId),
		}),
		{
			successToast: 'Render queued',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const renderedDownloadUrl = renderJobId
		? `/api/threads/rendered?jobId=${encodeURIComponent(renderJobId)}&download=1`
		: null

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-1">
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								Thread
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{thread?.title ?? '…'}
							</h1>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							asChild
						>
							<Link to="/threads">Back</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-4 pt-8 pb-6 sm:px-6 lg:px-8">
				<div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Preview
				</div>
				<ThreadRemotionPreviewCard
					thread={thread as any}
					root={root as any}
					replies={replies as any}
					isLoading={dataQuery.isLoading}
				/>
			</div>

			<div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							Posts
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{root ? (
							<button
								type="button"
								onClick={() => setSelectedPostId(root.id)}
								className={`w-full text-left border px-3 py-2 font-mono text-xs ${
									selectedPostId === root.id
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/30'
								}`}
							>
								<div className="uppercase tracking-widest text-[10px] text-muted-foreground">
									ROOT
								</div>
								<div className="truncate">{root.authorName}</div>
							</button>
						) : null}

						<div className="pt-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
							REPLIES ({replies.length})
						</div>
						<div className="space-y-2">
							{replies.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => setSelectedPostId(p.id)}
									className={`w-full text-left border px-3 py-2 font-mono text-xs ${
										selectedPostId === p.id
											? 'border-primary bg-primary/5'
											: 'border-border hover:bg-muted/30'
									}`}
								>
									<div className="truncate">{p.authorName}</div>
									<div className="truncate text-[10px] text-muted-foreground">
										{p.plainText || '(empty)'}
									</div>
								</button>
							))}
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							Editor
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-1 font-mono text-xs text-muted-foreground">
							<div>postId: {selectedPost?.id ?? '-'}</div>
							<div>author: {selectedPost?.authorName ?? '-'}</div>
							<div>role: {selectedPost?.role ?? '-'}</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Media
								</div>
								{assets.some(
									(a: any) => a?.status === 'pending' || (a?.status === 'ready' && !a?.storageKey),
								) ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase tracking-widest"
										disabled={ingestAssetsMutation.isPending}
										onClick={() => ingestAssetsMutation.mutate({ threadId: id })}
									>
										{ingestAssetsMutation.isPending ? 'Downloading…' : 'Download'}
									</Button>
								) : null}
							</div>

							{selectedPost?.authorAvatarAssetId ? (
								<div className="border border-border bg-muted/30 px-3 py-2 font-mono text-xs space-y-1">
									<div>avatarAssetId: {selectedPost.authorAvatarAssetId}</div>
									{assetsById.get(selectedPost.authorAvatarAssetId) ? (
										<div className="text-muted-foreground">
										asset: {assetsById.get(selectedPost.authorAvatarAssetId).kind}{' '}
											{assetsById.get(selectedPost.authorAvatarAssetId).sourceUrl
												? `url=${assetsById.get(selectedPost.authorAvatarAssetId).sourceUrl}`
												: assetsById.get(selectedPost.authorAvatarAssetId).storageKey
													? `storageKey=${assetsById.get(selectedPost.authorAvatarAssetId).storageKey}`
													: '(no url)'}
											{assetsById.get(selectedPost.authorAvatarAssetId).status
												? ` status=${assetsById.get(selectedPost.authorAvatarAssetId).status}`
												: null}
										</div>
									) : (
										<div className="text-muted-foreground">
											asset row not found in `thread_assets`
										</div>
									)}
								</div>
							) : null}

							{(selectedPost?.contentBlocks ?? []).filter((b: any) => b?.type !== 'text')
								.length === 0 ? (
								<div className="font-mono text-xs text-muted-foreground">
									No image/video/link blocks on this post.
								</div>
							) : (
								<div className="space-y-2">
									{(selectedPost?.contentBlocks ?? [])
										.filter((b: any) => b?.type && b.type !== 'text')
										.map((b: any) => {
											if (b.type === 'image' || b.type === 'video') {
												const assetId = String(b.data?.assetId ?? '')
												const asset = assetId ? assetsById.get(assetId) : null
												const url = asset?.sourceUrl || null

												return (
													<div
														key={String(b.id)}
														className="border border-border bg-muted/30 px-3 py-2 font-mono text-xs space-y-1"
													>
														<div>
															{b.type} assetId={assetId || '(missing)'}
														</div>
														{b.type === 'image' && b.data?.caption ? (
															<div className="text-muted-foreground">
																caption: {String(b.data.caption)}
															</div>
														) : null}
														{b.type === 'video' && b.data?.title ? (
															<div className="text-muted-foreground">
																title: {String(b.data.title)}
															</div>
														) : null}
														{asset ? (
															<div className="text-muted-foreground">
																asset: kind={asset.kind} bytes={asset.bytes ?? '-'}{' '}
																{asset.width && asset.height
																	? `dim=${asset.width}x${asset.height}`
																	: null}{' '}
																status={asset.status}{' '}
																{asset.storageKey ? `storageKey=${asset.storageKey}` : null}
															</div>
														) : (
															<div className="text-muted-foreground">
																asset row not found in `thread_assets`
															</div>
														)}
														{asset?.sourceUrl ? (
															<a
																className="underline"
																href={asset.sourceUrl}
																target="_blank"
																rel="noreferrer"
															>
																Open sourceUrl
															</a>
														) : null}
														{b.type === 'image' && url ? (
															<img
																alt=""
																src={url}
																className="mt-2 max-h-[220px] w-full rounded-none border border-border object-contain bg-background"
															/>
														) : null}
														{b.type === 'video' && url ? (
															<video
																controls
																src={url}
																className="mt-2 max-h-[260px] w-full rounded-none border border-border bg-background"
															/>
														) : null}
													</div>
												)
											}

											if (b.type === 'link') {
												const previewAssetId = b.data?.previewAssetId
													? String(b.data.previewAssetId)
													: null
												const previewAsset = previewAssetId
													? assetsById.get(previewAssetId)
													: null

												return (
													<div
														key={String(b.id)}
														className="border border-border bg-muted/30 px-3 py-2 font-mono text-xs space-y-1"
													>
														<div>link: {String(b.data?.url ?? '')}</div>
														{b.data?.title ? (
															<div className="text-muted-foreground">
																title: {String(b.data.title)}
															</div>
														) : null}
														{b.data?.description ? (
															<div className="text-muted-foreground">
																desc: {String(b.data.description)}
															</div>
														) : null}
														{previewAssetId ? (
															<div className="text-muted-foreground">
																previewAssetId: {previewAssetId}{' '}
																{previewAsset?.sourceUrl ? `url=${previewAsset.sourceUrl}` : null}
															</div>
														) : (
															<div className="text-muted-foreground">
																previewAssetId: -
															</div>
														)}
													</div>
												)
											}

											return (
												<div
													key={String(b.id)}
													className="border border-border bg-muted/30 px-3 py-2 font-mono text-xs"
												>
													unknown block type: {String(b.type)}
												</div>
											)
										})}
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Text (MVP: single text block)
							</Label>
							<Textarea
								value={draftText}
								onChange={(e) => setDraftText(e.target.value)}
								className="rounded-none font-mono text-xs min-h-[240px]"
							/>
						</div>

						<div className="flex items-center gap-3">
							<Button
								className="rounded-none font-mono text-xs uppercase"
								disabled={
									updateMutation.isPending ||
									!selectedPost?.id ||
									!thread?.id
								}
								onClick={() => {
									if (!thread?.id || !selectedPost?.id) return
									updateMutation.mutate({
										threadId: thread.id,
										postId: selectedPost.id,
										text: draftText,
									})
								}}
							>
								Save
							</Button>
							<Button
								type="button"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								onClick={() => {
									setDraftText(firstTextBlockText(selectedPost?.contentBlocks) || '')
									toast.message('Reset')
								}}
							>
								Reset
							</Button>
						</div>

						<details className="border border-border rounded-none">
							<summary className="cursor-pointer select-none px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Stored (DB) / Raw
							</summary>
							<div className="px-3 pb-3 space-y-3">
								<div className="space-y-2">
									<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										Selected post row
									</div>
									<pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted/30 p-3 font-mono text-xs">
										{selectedPostJson || '(none)'}
									</pre>
								</div>
								<div className="space-y-2">
									<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										Thread row
									</div>
									<pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted/30 p-3 font-mono text-xs">
										{threadJson || '(none)'}
									</pre>
								</div>
							</div>
						</details>
					</CardContent>
				</Card>
			</div>

			<div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8 space-y-3">
				<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Render (Cloud)
				</div>
				<Card className="rounded-none">
					<CardContent className="py-5 space-y-3">
						<div className="flex flex-wrap items-center gap-3">
							<Button
								className="rounded-none font-mono text-xs uppercase"
								disabled={startRenderMutation.isPending || !thread || !root}
								onClick={() => {
									startRenderMutation.mutate({ threadId: id })
								}}
							>
								Start Render
							</Button>
							{renderJobId ? (
								<div className="font-mono text-xs text-muted-foreground">
									jobId: {renderJobId}
								</div>
							) : null}
						</div>

						{renderJobId ? (
							<div className="font-mono text-xs text-muted-foreground space-y-1">
								<div>status: {renderStatusQuery.data?.status ?? '...'}</div>
								{typeof renderStatusQuery.data?.progress === 'number' ? (
									<div>
										progress: {Math.round(renderStatusQuery.data.progress * 100)}%
									</div>
								) : null}
								{renderStatusQuery.data?.status === 'completed' &&
								renderedDownloadUrl ? (
									<a className="underline" href={renderedDownloadUrl}>
										Download mp4
									</a>
								) : null}
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
