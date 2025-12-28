import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { ThreadRemotionPreviewCard } from '~/components/business/threads/thread-remotion-preview-card'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'
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

function guessAudioContentType(file: File): string {
	if (file.type) return file.type
	const name = file.name.toLowerCase()
	if (name.endsWith('.mp3')) return 'audio/mpeg'
	if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4'
	if (name.endsWith('.wav')) return 'audio/wav'
	if (name.endsWith('.aac')) return 'audio/aac'
	if (name.endsWith('.ogg')) return 'audio/ogg'
	if (name.endsWith('.webm')) return 'audio/webm'
	if (name.endsWith('.flac')) return 'audio/flac'
	return ''
}

async function readAudioDurationMs(file: File): Promise<number> {
	const url = URL.createObjectURL(file)
	try {
		const audio = document.createElement('audio')
		audio.preload = 'metadata'

		const durationSeconds = await new Promise<number>((resolve, reject) => {
			audio.onloadedmetadata = () => resolve(audio.duration)
			audio.onerror = () => reject(new Error('Failed to read audio metadata'))
			audio.src = url
		})

		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new Error('Invalid audio duration')
		}

		return Math.round(durationSeconds * 1000)
	} finally {
		URL.revokeObjectURL(url)
	}
}

function ThreadDetailRoute() {
	const { id } = Route.useParams()
	const qc = useQueryClient()
	const t = useTranslations('Threads.detail')

	const dataQuery = useQuery(queryOrpc.thread.byId.queryOptions({ input: { id } }))
	const thread = dataQuery.data?.thread ?? null
	const root = dataQuery.data?.root ?? null
	const replies = dataQuery.data?.replies ?? []
	const assets = dataQuery.data?.assets ?? []
	const audio = dataQuery.data?.audio ?? null
	const audioAssets = dataQuery.data?.audioAssets ?? []

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
			successToast: t('toasts.saved'),
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
				t('toasts.mediaIngest', {
					processed: data.processed,
					ok: data.succeeded,
					failed: data.failed,
				}),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpc.thread.translatePost.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.translated'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const translateAllMutation = useEnhancedMutation(
		queryOrpc.thread.translateAllPosts.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: ({ data }) =>
				t('toasts.translatedAll', {
					processed: data.processed,
					translated: data.translated,
					skipped: data.skipped,
					failed: data.failed,
				}),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const selectedZhTranslation = React.useMemo(() => {
		const text = (selectedPost as any)?.translations?.['zh-CN']?.plainText
		return typeof text === 'string' ? text : ''
	}, [selectedPost])

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
			successToast: t('toasts.renderQueued'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const renderedDownloadUrl = renderJobId
		? `/api/threads/rendered?jobId=${encodeURIComponent(renderJobId)}&download=1`
		: null

	// ---------- Thread audio ----------
	const audioFileInputRef = React.useRef<HTMLInputElement | null>(null)
	const [isUploadingAudio, setIsUploadingAudio] = React.useState(false)

	const createAudioUploadMutation = useEnhancedMutation(
		queryOrpc.thread.audio.createUpload.mutationOptions(),
	)
	const completeAudioUploadMutation = useEnhancedMutation(
		queryOrpc.thread.audio.completeUpload.mutationOptions(),
	)
	const setAudioAssetMutation = useEnhancedMutation(
		queryOrpc.thread.setAudioAsset.mutationOptions(),
	)

	async function refreshThread() {
		await qc.invalidateQueries({
			queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
		})
	}

	async function setThreadAudio(audioAssetId: string | null) {
		await setAudioAssetMutation.mutateAsync({ threadId: id, audioAssetId })
		await refreshThread()
		toast.success(audioAssetId ? t('audio.toasts.set') : t('audio.toasts.cleared'))
	}

	async function uploadThreadAudio(file: File) {
		const contentType = guessAudioContentType(file)
		if (!contentType) {
			toast.error(t('audio.toasts.unknownType'))
			return
		}

		setIsUploadingAudio(true)
		try {
			const { assetId, putUrl } = await createAudioUploadMutation.mutateAsync({
				threadId: id,
				contentType,
				bytes: file.size,
			})

			const putRes = await fetch(putUrl, {
				method: 'PUT',
				headers: {
					'content-type': contentType,
					'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
				},
				body: file,
			})
			if (!putRes.ok) {
				throw new Error(`Upload failed: ${putRes.status} ${await putRes.text()}`)
			}

			const durationMs = await readAudioDurationMs(file)
			await completeAudioUploadMutation.mutateAsync({
				threadId: id,
				assetId,
				bytes: file.size,
				durationMs,
			})

			await setAudioAssetMutation.mutateAsync({ threadId: id, audioAssetId: assetId })
			await refreshThread()
			toast.success(t('audio.toasts.uploaded'))
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			toast.error(msg)
		} finally {
			setIsUploadingAudio(false)
			if (audioFileInputRef.current) audioFileInputRef.current.value = ''
		}
	}

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-1">
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								{t('header.breadcrumb')}
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{thread?.title ?? '…'}
							</h1>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								disabled={translateAllMutation.isPending || !thread?.id}
								onClick={() => {
									if (!thread?.id) return
									translateAllMutation.mutate({
										threadId: thread.id,
										targetLocale: 'zh-CN',
										maxPosts: 30,
									})
								}}
							>
								{translateAllMutation.isPending
									? t('actions.translatingAll')
									: t('actions.translateAllToZh')}
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								asChild
							>
								<Link to="/threads">{t('actions.back')}</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-4 pt-8 pb-6 sm:px-6 lg:px-8">
				<div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					{t('sections.preview')}
				</div>
				<ThreadRemotionPreviewCard
					thread={thread as any}
					root={root as any}
					replies={replies as any}
					assets={assets as any}
					audio={
						audio?.url && audio?.asset?.durationMs
							? {
									url: String(audio.url),
									durationMs: Number(audio.asset.durationMs),
								}
							: null
					}
					isLoading={dataQuery.isLoading}
				/>

				<div className="mt-6">
					<div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						{t('sections.audio')}
					</div>
					<Card className="rounded-none">
						<CardContent className="py-5 space-y-4">
							<div className="flex flex-wrap items-center gap-3">
								<input
									ref={audioFileInputRef}
									type="file"
									accept="audio/*"
									className="hidden"
									onChange={(e) => {
										const f = e.target.files?.[0]
										if (!f) return
										void uploadThreadAudio(f)
									}}
								/>
								<Button
									type="button"
									className="rounded-none font-mono text-xs uppercase"
									disabled={isUploadingAudio}
									onClick={() => audioFileInputRef.current?.click()}
								>
									{isUploadingAudio ? t('audio.actions.uploading') : t('audio.actions.upload')}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={setAudioAssetMutation.isPending || !thread?.audioAssetId}
									onClick={() => void setThreadAudio(null)}
								>
									{t('audio.actions.clear')}
								</Button>
								{audio?.asset?.id ? (
									<div className="font-mono text-xs text-muted-foreground">
										{t('audio.labels.current', { id: String(audio.asset.id) })}
									</div>
								) : (
									<div className="font-mono text-xs text-muted-foreground">
										{t('audio.labels.none')}
									</div>
								)}
							</div>

							{audio?.url ? (
								<audio
									controls
									src={String(audio.url)}
									className="w-full"
								/>
							) : audio?.asset ? (
								<div className="font-mono text-xs text-muted-foreground">
									{t('audio.labels.urlMissing')}
								</div>
							) : null}

							{audioAssets.length > 0 ? (
								<div className="space-y-2">
									<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('audio.labels.library')}
									</div>
									<div className="grid grid-cols-1 gap-2">
										{audioAssets.map((a: any) => {
											const isCurrent = thread?.audioAssetId && String(thread.audioAssetId) === String(a.id)
											return (
												<div
													key={String(a.id)}
													className={`border px-3 py-2 font-mono text-xs ${
														isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
													}`}
												>
													<div className="flex flex-wrap items-center justify-between gap-3">
														<div className="truncate">
															{String(a.id)}
															{typeof a.durationMs === 'number' ? ` · ${Math.round(a.durationMs / 1000)}s` : ''}
															{typeof a.bytes === 'number' ? ` · ${Math.round(a.bytes / 1024)}KB` : ''}
															{a.status ? ` · ${String(a.status)}` : ''}
														</div>
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="rounded-none font-mono text-[10px] uppercase tracking-widest"
															disabled={setAudioAssetMutation.isPending || String(a.status) !== 'ready'}
															onClick={() => void setThreadAudio(String(a.id))}
														>
															{t('audio.actions.use')}
														</Button>
													</div>
												</div>
											)
										})}
									</div>
								</div>
							) : (
								<div className="font-mono text-xs text-muted-foreground">
									{t('audio.labels.libraryEmpty')}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							{t('sections.posts')}
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
									{t('labels.root')}
								</div>
								<div className="truncate">{root.authorName}</div>
							</button>
						) : null}

						<div className="pt-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
							{t('labels.replies', { count: replies.length })}
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
										{p.plainText || t('labels.emptyText')}
									</div>
								</button>
							))}
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							{t('sections.editor')}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('sections.media')}
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
										{ingestAssetsMutation.isPending
											? t('actions.downloading')
											: t('actions.download')}
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
											{t('media.assetRowMissing')}
										</div>
									)}
								</div>
							) : null}

							{(selectedPost?.contentBlocks ?? []).filter((b: any) => b?.type !== 'text')
								.length === 0 ? (
								<div className="font-mono text-xs text-muted-foreground">
									{t('media.noBlocks')}
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
																{t('media.assetRowMissing')}
															</div>
														)}
														{asset?.sourceUrl ? (
															<a
																className="underline"
																href={asset.sourceUrl}
																target="_blank"
																rel="noreferrer"
															>
																{t('media.openSourceUrl')}
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
														<div>
															{t('media.labels.link')}: {String(b.data?.url ?? '')}
														</div>
														{b.data?.title ? (
															<div className="text-muted-foreground">
																{t('media.labels.title')}: {String(b.data.title)}
															</div>
														) : null}
														{b.data?.description ? (
															<div className="text-muted-foreground">
																{t('media.labels.description')}:{' '}
																{String(b.data.description)}
															</div>
														) : null}
														{previewAssetId ? (
															<div className="text-muted-foreground">
																{t('media.labels.previewAssetId')}: {previewAssetId}{' '}
																{previewAsset?.sourceUrl ? `url=${previewAsset.sourceUrl}` : null}
															</div>
														) : (
															<div className="text-muted-foreground">
																{t('media.labels.previewAssetId')}: -
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
													{t('media.unknownBlockType', { type: String(b.type) })}
												</div>
											)
										})}
								</div>
							)}
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('sections.translation')}
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase tracking-widest"
										disabled={translateMutation.isPending || !thread?.id || !selectedPost?.id}
										onClick={() => {
											if (!thread?.id || !selectedPost?.id) return
											translateMutation.mutate({
												threadId: thread.id,
												postId: selectedPost.id,
												targetLocale: 'zh-CN',
											})
										}}
									>
										{translateMutation.isPending ? (
											<>
												<Loader2 className="h-3 w-3 animate-spin" />
												{t('actions.translating')}
											</>
										) : (
											t('actions.translateToZh')
										)}
									</Button>

									{selectedZhTranslation ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="rounded-none font-mono text-[10px] uppercase tracking-widest"
											onClick={() => {
												setDraftText(selectedZhTranslation)
												toast.message(t('toasts.translationApplied'))
											}}
										>
											{t('actions.useTranslation')}
										</Button>
									) : null}
								</div>
							</div>

							{selectedZhTranslation ? (
								<Textarea
									value={selectedZhTranslation}
									readOnly
									className="rounded-none font-mono text-xs min-h-[140px]"
								/>
							) : (
								<div className="font-mono text-xs text-muted-foreground">
									{t('translation.empty')}
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('editor.textLabel')}
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
								{t('actions.save')}
							</Button>
							<Button
								type="button"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								onClick={() => {
									setDraftText(firstTextBlockText(selectedPost?.contentBlocks) || '')
									toast.message(t('toasts.reset'))
								}}
							>
								{t('actions.reset')}
							</Button>
						</div>

						<details className="border border-border rounded-none">
							<summary className="cursor-pointer select-none px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('sections.debug')}
							</summary>
							<div className="px-3 pb-3 space-y-3">
								<div className="space-y-2">
									<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('debug.selectedPostRow')}
									</div>
									<pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted/30 p-3 font-mono text-xs">
										{selectedPostJson || t('debug.none')}
									</pre>
								</div>
								<div className="space-y-2">
									<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('debug.threadRow')}
									</div>
									<pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted/30 p-3 font-mono text-xs">
										{threadJson || t('debug.none')}
									</pre>
								</div>
							</div>
						</details>
					</CardContent>
				</Card>
			</div>

			<div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8 space-y-3">
				<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					{t('sections.render')}
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
								{t('actions.startRender')}
							</Button>
							{renderJobId ? (
								<div className="font-mono text-xs text-muted-foreground">
									{t('render.jobId', { jobId: renderJobId })}
								</div>
							) : null}
						</div>

						{renderJobId ? (
							<div className="font-mono text-xs text-muted-foreground space-y-1">
								<div>
									{t('render.status', {
										status: renderStatusQuery.data?.status ?? '...',
									})}
								</div>
								{typeof renderStatusQuery.data?.progress === 'number' ? (
									<div>
										{t('render.progress', {
											progress: Math.round(renderStatusQuery.data.progress * 100),
										})}
									</div>
								) : null}
								{renderStatusQuery.data?.status === 'completed' &&
								renderedDownloadUrl ? (
									<a className="underline" href={renderedDownloadUrl}>
										{t('render.downloadMp4')}
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
