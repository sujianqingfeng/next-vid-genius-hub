import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ThreadRemotionEditorCard } from '~/components/business/threads/thread-remotion-editor-card'
import { ThreadRemotionPlayerCard } from '~/components/business/threads/thread-remotion-player-card'
import { ThreadTemplateVisualEditor } from '~/components/business/threads/thread-template-visual-editor'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/client'
import {
	DEFAULT_THREAD_TEMPLATE_CONFIG,
	normalizeThreadTemplateConfig,
} from '@app/remotion-project/thread-template-config'
import type { ThreadTemplateConfigV1 } from '@app/remotion-project/types'

const SearchSchema = z.object({
	previewThreadId: z.string().optional().default(''),
})

export const Route = createFileRoute(
	'/thread-templates/$libraryId/versions/$versionId/editor',
)({
	validateSearch: SearchSchema,
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: ThreadTemplateVersionEditorRoute,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function coerceJsonValue(value: unknown): unknown {
	if (typeof value !== 'string') return value
	const text = value.trim()
	if (!text) return value
	if (!(text.startsWith('{') || text.startsWith('['))) return value
	try {
		return JSON.parse(text) as unknown
	} catch {
		return value
	}
}

function toConfigFromVersionRow(row: any): ThreadTemplateConfigV1 | null {
	const raw = coerceJsonValue(
		row?.templateConfigResolved ?? row?.templateConfig,
	)
	if (!isPlainObject(raw) || (raw as any).version !== 1) return null
	try {
		return normalizeThreadTemplateConfig(raw) as ThreadTemplateConfigV1
	} catch {
		return null
	}
}

function ThreadTemplateVersionEditorRoute() {
	const { libraryId, versionId } = Route.useParams()
	const { previewThreadId } = Route.useSearch()
	const navigate = Route.useNavigate()
	const qc = useQueryClient()

	const versionsQuery = useQuery(
		queryOrpc.threadTemplate.versions.queryOptions({
			input: { libraryId, limit: 100 },
		}),
	)
	const library = versionsQuery.data?.library ?? null
	const versions = versionsQuery.data?.versions ?? []
	const selectedVersion =
		versions.find((v: any) => String(v.id) === String(versionId)) ?? null

	const previewThreadQuery = useQuery(
		queryOrpc.thread.byId.queryOptions({
			input: { id: previewThreadId },
			enabled: Boolean(previewThreadId),
		}),
	)
	const previewThread = previewThreadQuery.data?.thread ?? null
	const previewRoot = previewThreadQuery.data?.root ?? null
	const previewReplies = previewThreadQuery.data?.replies ?? []
	const previewAssets = previewThreadQuery.data?.assets ?? []
	const previewAudio = previewThreadQuery.data?.audio ?? null

	const threadsQuery = useQuery(queryOrpc.thread.list.queryOptions())
	const threads = threadsQuery.data?.items ?? []

	const [note, setNote] = React.useState('')

	const [previewMode, setPreviewMode] = React.useState<'edit' | 'play'>('edit')
	const [showAdvanced, setShowAdvanced] = React.useState(false)
	const [visualTemplateConfig, setVisualTemplateConfig] =
		React.useState<ThreadTemplateConfigV1>(DEFAULT_THREAD_TEMPLATE_CONFIG)
	const [visualTemplateHistory, setVisualTemplateHistory] = React.useState<{
		past: ThreadTemplateConfigV1[]
		future: ThreadTemplateConfigV1[]
	}>({ past: [], future: [] })
	const visualTxnRef = React.useRef<{ base: ThreadTemplateConfigV1 } | null>(
		null,
	)
	const visualTemplateConfigRef = React.useRef<ThreadTemplateConfigV1>(
		DEFAULT_THREAD_TEMPLATE_CONFIG,
	)
	const visualTemplateHistoryRef = React.useRef<{
		past: ThreadTemplateConfigV1[]
		future: ThreadTemplateConfigV1[]
	}>({ past: [], future: [] })
	React.useEffect(() => {
		visualTemplateConfigRef.current = visualTemplateConfig
	}, [visualTemplateConfig])
	React.useEffect(() => {
		visualTemplateHistoryRef.current = visualTemplateHistory
	}, [visualTemplateHistory])

	function syncEditorFromVersion(next: any) {
		const base = toConfigFromVersionRow(next) ?? DEFAULT_THREAD_TEMPLATE_CONFIG
		setVisualTemplateConfig(base)
		setVisualTemplateHistory({ past: [], future: [] })
		visualTxnRef.current = null
	}

	React.useEffect(() => {
		if (!selectedVersion) return
		syncEditorFromVersion(selectedVersion)
		setNote('')
	}, [selectedVersion?.id])

	const normalizedTemplateConfig = visualTemplateConfig

	function applyVisualTemplateConfigExternal(next: ThreadTemplateConfigV1) {
		setVisualTemplateConfig((prev) => {
			const normalized = normalizeThreadTemplateConfig(next)
			const txn = visualTxnRef.current
			if (!txn) {
				setVisualTemplateHistory((h) => ({
					past: [...h.past, prev],
					future: [],
				}))
			}
			return normalized
		})
	}

	function beginVisualTemplateTxn() {
		if (visualTxnRef.current) return
		visualTxnRef.current = { base: visualTemplateConfig }
	}

	function endVisualTemplateTxn() {
		const txn = visualTxnRef.current
		visualTxnRef.current = null
		if (!txn) return
		const before = JSON.stringify(txn.base)
		const after = JSON.stringify(visualTemplateConfig)
		if (before === after) return
		setVisualTemplateHistory((h) => ({
			past: [...h.past, txn.base],
			future: [],
		}))
	}

	function undoVisualTemplate() {
		visualTxnRef.current = null
		const h = visualTemplateHistoryRef.current
		if (h.past.length === 0) return
		const prev = h.past[h.past.length - 1]!
		const cur = visualTemplateConfigRef.current
		setVisualTemplateHistory({
			past: h.past.slice(0, -1),
			future: [...h.future, cur],
		})
		setVisualTemplateConfig(prev)
	}

	function redoVisualTemplate() {
		visualTxnRef.current = null
		const h = visualTemplateHistoryRef.current
		if (h.future.length === 0) return
		const next = h.future[h.future.length - 1]!
		const cur = visualTemplateConfigRef.current
		setVisualTemplateHistory({
			past: [...h.past, cur],
			future: h.future.slice(0, -1),
		})
		setVisualTemplateConfig(next)
	}

	const publishMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.addVersion.mutationOptions({
			onSuccess: async (data) => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.versions.queryKey({
						input: { libraryId, limit: 100 },
					}),
				})

				const newVersionId = String((data as any)?.versionId ?? '')
				if (!newVersionId) return

				await navigate({
					to: '/thread-templates/$libraryId/versions/$versionId/editor',
					params: { libraryId, versionId: newVersionId },
					search: { previewThreadId },
				})
			},
		}),
		{
			successToast: 'Published new version',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const canPublish =
		Boolean(library) &&
		!publishMutation.isPending &&
		Boolean(normalizedTemplateConfig) &&
		Boolean(previewThreadId)

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-1">
								<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
									Template Editor
								</div>
								<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
									{library ? String((library as any).name) : '…'}
								</h1>
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{selectedVersion
										? `Version v${Number((selectedVersion as any).version)}`
										: 'Version …'}
									{library ? ` · templateId=${String((library as any).templateId)}` : ''}
								</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								asChild
							>
								<Link to="/thread-templates">Back</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[520px_1fr]">
					<div className="space-y-6">
						<Card className="rounded-none">
							<CardHeader>
								<CardTitle className="font-mono text-sm uppercase tracking-widest">
									Context
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid grid-cols-1 gap-4">
									<div className="space-y-2">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Version
										</Label>
										<Select
											value={String(versionId)}
											disabled={
												versionsQuery.isLoading || versions.length === 0
											}
											onValueChange={(v) => {
												void navigate({
													to: '/thread-templates/$libraryId/versions/$versionId/editor',
													params: { libraryId, versionId: v },
													search: { previewThreadId },
												})
											}}
										>
											<SelectTrigger className="rounded-none font-mono text-xs h-9">
												<SelectValue placeholder="Select version" />
											</SelectTrigger>
											<SelectContent>
												{versions.map((v: any) => (
													<SelectItem key={String(v.id)} value={String(v.id)}>
														v{Number(v.version)} · {String(v.id).slice(0, 12)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

										<div className="space-y-2">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												Preview With
											</Label>
											<Select
												value={previewThreadId || ''}
												onValueChange={(v) => {
													void navigate({ search: { previewThreadId: v } })
											}}
										>
											<SelectTrigger className="rounded-none font-mono text-xs h-9">
												<SelectValue placeholder="Pick a recent thread" />
											</SelectTrigger>
											<SelectContent>
												{threads.map((t: any) => (
													<SelectItem key={String(t.id)} value={String(t.id)}>
														{String(t.title || t.id).slice(0, 40)} ·{' '}
														{String(t.id).slice(0, 10)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										{previewThreadId && previewThreadQuery.isError ? (
											<div className="font-mono text-xs text-destructive">
												Failed to load preview thread.
											</div>
										) : null}
											{!previewThreadId ? (
												<div className="font-mono text-xs text-muted-foreground">
													Choose a thread so you can preview and publish changes.
												</div>
											) : null}
										</div>

									<div className="space-y-2">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Publish Note (optional)
										</Label>
										<Input
											value={note}
											onChange={(e) => setNote(e.target.value)}
											placeholder="e.g. tweak cover typography"
											className="rounded-none font-mono text-xs h-9"
										/>
									</div>
								</div>

								<div className="flex flex-wrap items-center justify-between gap-2">
									<Button
										type="button"
										variant="outline"
										className="rounded-none font-mono text-xs uppercase"
										disabled={!selectedVersion}
										onClick={() => {
											if (!selectedVersion) return
											syncEditorFromVersion(selectedVersion)
											toast.message('Reset to version')
										}}
									>
										Reset
									</Button>
										<Button
											type="button"
											className="rounded-none font-mono text-xs uppercase"
											disabled={!canPublish}
											onClick={() => {
												if (!library) return
												if (!previewThreadId) {
													toast.error('Pick a preview thread first')
													return
												}
												publishMutation.mutate({
													libraryId,
													templateConfig: normalizedTemplateConfig,
													note: note.trim() || undefined,
												sourceThreadId: previewThreadId,
											})
										}}
									>
										{publishMutation.isPending
											? 'Publishing…'
											: 'Publish Version'}
									</Button>
								</div>
							</CardContent>
						</Card>

							<Card className="rounded-none">
								<CardHeader>
									<CardTitle className="font-mono text-sm uppercase tracking-widest">
										Layout
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="font-mono text-xs text-muted-foreground">
											Edit visually. You can publish a new version when ready.
										</div>
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="rounded-none font-mono text-[10px] uppercase"
											onClick={() => setShowAdvanced((v) => !v)}
										>
											{showAdvanced ? 'Hide advanced' : 'Advanced'}
										</Button>
									</div>

									<ThreadTemplateVisualEditor
										value={visualTemplateConfig}
										onChange={(next) =>
											setVisualTemplateConfig(normalizeThreadTemplateConfig(next))
										}
										assets={previewAssets as any}
										historyState={visualTemplateHistory}
										setHistoryState={setVisualTemplateHistory}
										resetKey={String(selectedVersion?.id ?? '')}
									/>

									{showAdvanced ? (
										<div className="space-y-2">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												Config (read-only JSON)
											</Label>
											<Textarea
												value={toPrettyJson(visualTemplateConfig)}
												readOnly
												className="min-h-[180px] rounded-none font-mono text-xs"
											/>
											<div className="font-mono text-xs text-muted-foreground">
												This is the normalized config used for preview/publish.
											</div>
										</div>
									) : null}
								</CardContent>
							</Card>
					</div>

					<div className="space-y-6">
						<div>
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Preview
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant={previewMode === 'edit' ? 'default' : 'outline'}
										className="rounded-none font-mono text-[10px] uppercase"
										onClick={() => setPreviewMode('edit')}
									>
										Edit
									</Button>
									<Button
										type="button"
										size="sm"
										variant={previewMode === 'play' ? 'default' : 'outline'}
										className="rounded-none font-mono text-[10px] uppercase"
										onClick={() => setPreviewMode('play')}
									>
										Play
									</Button>
								</div>
							</div>

							{previewMode === 'edit' ? (
								<ThreadRemotionEditorCard
									thread={previewThread as any}
									root={previewRoot as any}
									replies={previewReplies as any}
									assets={previewAssets as any}
									audio={
										previewAudio?.url && previewAudio?.asset?.durationMs
											? {
													url: String(previewAudio.url),
													durationMs: Number(previewAudio.asset.durationMs),
												}
											: null
									}
										isLoading={previewThreadQuery.isLoading}
										templateId={(library as any)?.templateId as any}
										templateConfig={normalizedTemplateConfig as any}
										editCanvasConfig={visualTemplateConfig as any}
										canEditUndo={visualTemplateHistory.past.length > 0}
										canEditRedo={visualTemplateHistory.future.length > 0}
										onEditUndo={() => {
											undoVisualTemplate()
										}}
										onEditRedo={() => {
											redoVisualTemplate()
										}}
										onEditCanvasConfigChange={(next) => {
											applyVisualTemplateConfigExternal(next)
										}}
										onEditCanvasTransaction={(phase) => {
											if (phase === 'start') beginVisualTemplateTxn()
											else endVisualTemplateTxn()
										}}
									/>
							) : (
								<ThreadRemotionPlayerCard
									thread={previewThread as any}
									root={previewRoot as any}
									replies={previewReplies as any}
									assets={previewAssets as any}
									audio={
										previewAudio?.url && previewAudio?.asset?.durationMs
											? {
													url: String(previewAudio.url),
													durationMs: Number(previewAudio.asset.durationMs),
												}
											: null
									}
									isLoading={previewThreadQuery.isLoading}
									templateId={(library as any)?.templateId as any}
									templateConfig={normalizedTemplateConfig as any}
								/>
							)}
							{previewThreadId &&
							!previewRoot &&
							!previewThreadQuery.isLoading ? (
								<div className="mt-3 font-mono text-xs text-muted-foreground">
									Preview thread has no root post (or failed to load).
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
