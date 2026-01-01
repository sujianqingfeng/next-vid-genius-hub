import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ThreadRemotionEditorCard } from '~/components/business/threads/thread-remotion-editor-card'
import { ThreadRemotionPlayerCard } from '~/components/business/threads/thread-remotion-player-card'
import { ThreadTemplateVisualEditor } from '~/components/business/threads/thread-template-visual-editor'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useLocalStorageState } from '~/lib/hooks/useLocalStorageState'
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

	type EditorLayoutState = {
		leftPx: number
		rightPx: number
		leftCollapsed: boolean
		rightCollapsed: boolean
	}

	const [layout, setLayout] = useLocalStorageState<EditorLayoutState>(
		'vg.threadTemplateEditor.layout.v1',
		{
			version: 1,
			defaultValue: {
				leftPx: 360,
				rightPx: 420,
				leftCollapsed: false,
				rightCollapsed: false,
			},
			migrate: (stored) => {
				if (!stored || typeof stored !== 'object') return null
				const leftPx = Number((stored as any).leftPx)
				const rightPx = Number((stored as any).rightPx)
				const leftCollapsed = Boolean((stored as any).leftCollapsed)
				const rightCollapsed = Boolean((stored as any).rightCollapsed)
				if (!Number.isFinite(leftPx) || !Number.isFinite(rightPx)) return null
				return {
					leftPx,
					rightPx,
					leftCollapsed,
					rightCollapsed,
				}
			},
		},
	)

	React.useEffect(() => {
		// Always start with all panels expanded when entering the editor.
		setLayout((prev) => {
			if (!prev.leftCollapsed && !prev.rightCollapsed) return prev
			return { ...prev, leftCollapsed: false, rightCollapsed: false }
		})
	}, [setLayout])

	const containerRef = React.useRef<HTMLDivElement | null>(null)
	const dragRef = React.useRef<{
		kind: 'left' | 'right'
		startX: number
		startLeft: number
		startRight: number
		rect: DOMRect
	} | null>(null)

	const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

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

	const [editorScene, setEditorScene] = React.useState<'cover' | 'post'>(
		'cover',
	)
	const [editorSelectedKey, setEditorSelectedKey] =
		React.useState<string>('cover:[]')

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
		setEditorScene('cover')
		setEditorSelectedKey('cover:[]')
	}, [selectedVersion?.id])

	const normalizedTemplateConfig = visualTemplateConfig

	const selectedVersionConfig = React.useMemo(() => {
		if (!selectedVersion) return null
		return (
			toConfigFromVersionRow(selectedVersion) ?? DEFAULT_THREAD_TEMPLATE_CONFIG
		)
	}, [selectedVersion?.id])

	const isDirty = React.useMemo(() => {
		if (!selectedVersionConfig) return false
		return (
			JSON.stringify(selectedVersionConfig) !==
			JSON.stringify(visualTemplateConfig)
		)
	}, [selectedVersionConfig, visualTemplateConfig])

	React.useEffect(() => {
		if (!isDirty) return
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ''
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [isDirty])

	function sceneFromNodeKey(key: string): 'cover' | 'post' | null {
		if (key.startsWith('cover:')) return 'cover'
		if (key.startsWith('post:')) return 'post'
		return null
	}

	function confirmDiscardChanges(action: string) {
		if (!isDirty) return true
		return window.confirm(
			`You have unpublished changes. Discard them and ${action}?`,
		)
	}

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

	const undoVisualTemplate = React.useCallback(() => {
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
	}, [])

	const redoVisualTemplate = React.useCallback(() => {
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
	}, [])

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

	const publishDisabledReason = !library
		? 'Loading template…'
		: publishMutation.isPending
			? 'Publishing…'
			: !previewThreadId
				? 'Pick a preview thread first'
				: null

	const canPublish =
		!publishDisabledReason &&
		Boolean(normalizedTemplateConfig) &&
		Boolean(library)

	const canPublishRef = React.useRef(canPublish)
	React.useEffect(() => {
		canPublishRef.current = canPublish
	}, [canPublish])

	const libraryRef = React.useRef(library)
	React.useEffect(() => {
		libraryRef.current = library
	}, [library])

	const previewThreadIdRef = React.useRef(previewThreadId)
	React.useEffect(() => {
		previewThreadIdRef.current = previewThreadId
	}, [previewThreadId])

	const noteRef = React.useRef(note)
	React.useEffect(() => {
		noteRef.current = note
	}, [note])

	const leftRailPx = 44
	const rightRailPx = 44
	const leftColPx = layout.leftCollapsed ? leftRailPx : layout.leftPx
	const rightColPx = layout.rightCollapsed ? rightRailPx : layout.rightPx

	function setLeftCollapsed(collapsed: boolean) {
		setLayout((prev) => ({ ...prev, leftCollapsed: collapsed }))
	}

	function setRightCollapsed(collapsed: boolean) {
		if (collapsed) setShowAdvanced(false)
		setLayout((prev) => ({ ...prev, rightCollapsed: collapsed }))
	}

	function isTypingTarget(target: EventTarget | null) {
		if (!target || !(target as any).tagName) return false
		const el = target as HTMLElement
		const tag = el.tagName
		return (
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			el.isContentEditable
		)
	}

	React.useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return

			if (e.key === '?' && e.shiftKey) {
				e.preventDefault()
				e.stopPropagation()
				setShortcutsOpen(true)
				return
			}

			const mod = e.metaKey || e.ctrlKey
			if (!mod) return

			const key = e.key.toLowerCase()
			if (key === 'z' && !e.shiftKey) {
				e.preventDefault()
				e.stopPropagation()
				undoVisualTemplate()
				return
			}
			if (key === 'z' && e.shiftKey) {
				e.preventDefault()
				e.stopPropagation()
				redoVisualTemplate()
				return
			}
			if (key === 'y') {
				e.preventDefault()
				e.stopPropagation()
				redoVisualTemplate()
				return
			}
			if (e.key === '\\') {
				e.preventDefault()
				e.stopPropagation()
				setLayout((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }))
				return
			}
			if (e.key === 'Enter') {
				if (!canPublishRef.current) return
				e.preventDefault()
				e.stopPropagation()
				if (!libraryRef.current) return
				if (!previewThreadIdRef.current) return
				publishMutation.mutate({
					libraryId,
					templateConfig: visualTemplateConfigRef.current,
					note: noteRef.current.trim() || undefined,
					sourceThreadId: previewThreadIdRef.current,
				})
			}
		}

		window.addEventListener('keydown', onKeyDown, true)
		return () => window.removeEventListener('keydown', onKeyDown, true)
	}, [
		libraryId,
		publishMutation,
		redoVisualTemplate,
		setLayout,
		undoVisualTemplate,
	])

	function startResize(kind: 'left' | 'right', e: React.PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		const container = containerRef.current
		if (!container) return

		const rect = container.getBoundingClientRect()
		dragRef.current = {
			kind,
			startX: e.clientX,
			startLeft: layout.leftPx,
			startRight: layout.rightPx,
			rect,
		}

		if (kind === 'left' && layout.leftCollapsed) setLeftCollapsed(false)
		if (kind === 'right' && layout.rightCollapsed) setRightCollapsed(false)

		const onMove = (ev: PointerEvent) => {
			const drag = dragRef.current
			if (!drag) return

			const dx = ev.clientX - drag.startX
			const width = drag.rect.width

			const minLeft = 240
			const minRight = 280
			const minCenter = 520
			const handles = 16

			if (drag.kind === 'left') {
				const currentRight = layout.rightCollapsed
					? rightRailPx
					: drag.startRight
				const maxLeft = Math.max(
					minLeft,
					width - currentRight - handles - minCenter,
				)
				const nextLeft = Math.round(
					Math.min(maxLeft, Math.max(minLeft, drag.startLeft + dx)),
				)
				setLayout((prev) => {
					if (prev.leftPx === nextLeft && prev.leftCollapsed === false)
						return prev
					return { ...prev, leftPx: nextLeft, leftCollapsed: false }
				})
				return
			}

			const currentLeft = layout.leftCollapsed ? leftRailPx : drag.startLeft
			const maxRight = Math.max(
				minRight,
				width - currentLeft - handles - minCenter,
			)
			const nextRight = Math.round(
				Math.min(maxRight, Math.max(minRight, drag.startRight - dx)),
			)
			setLayout((prev) => {
				if (prev.rightPx === nextRight && prev.rightCollapsed === false)
					return prev
				return { ...prev, rightPx: nextRight, rightCollapsed: false }
			})
		}

		const onUp = () => {
			dragRef.current = null
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
				<DialogContent className="rounded-none sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="font-mono uppercase tracking-widest text-sm">
							Shortcuts
						</DialogTitle>
						<DialogDescription className="font-mono text-xs">
							Press <span className="font-semibold">Shift + /</span> to open
							this again.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-2">
						<div className="grid grid-cols-1 gap-2">
							<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
								<div>Undo</div>
								<div>Ctrl/Cmd + Z</div>
							</div>
							<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
								<div>Redo</div>
								<div>Ctrl/Cmd + Shift + Z · Ctrl/Cmd + Y</div>
							</div>
							<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
								<div>Toggle Structure</div>
								<div>Ctrl/Cmd + \\</div>
							</div>
							<div className="flex items-center justify-between font-mono text-xs">
								<div>Publish</div>
								<div>Ctrl/Cmd + Enter</div>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
				<div className="mx-auto max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="min-w-0 space-y-1">
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								Template Editor
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="min-w-0 truncate font-mono text-xl font-bold uppercase tracking-tight">
									{library ? String((library as any).name) : '…'}
								</h1>
								{isDirty ? (
									<div className="rounded-none border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground">
										Unpublished changes
									</div>
								) : null}
							</div>
							<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{selectedVersion
									? `Version v${Number((selectedVersion as any).version)}`
									: 'Version …'}
								{library
									? ` · templateId=${String((library as any).templateId)}`
									: ''}
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Select
								value={String(versionId)}
								disabled={versionsQuery.isLoading || versions.length === 0}
								onValueChange={(v) => {
									if (String(v) === String(versionId)) return
									if (!confirmDiscardChanges('switch versions')) return
									void navigate({
										to: '/thread-templates/$libraryId/versions/$versionId/editor',
										params: { libraryId, versionId: v },
										search: { previewThreadId },
									})
								}}
							>
								<SelectTrigger className="rounded-none font-mono text-xs h-9 w-[190px]">
									<SelectValue placeholder="Version" />
								</SelectTrigger>
								<SelectContent>
									{versions.map((v: any) => (
										<SelectItem key={String(v.id)} value={String(v.id)}>
											v{Number(v.version)} · {String(v.id).slice(0, 10)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={previewThreadId || ''}
								onValueChange={(v) => {
									void navigate({ search: { previewThreadId: v } })
								}}
							>
								<SelectTrigger className="rounded-none font-mono text-xs h-9 w-[260px]">
									<SelectValue placeholder="Preview thread" />
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

							<Input
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Publish note…"
								className="rounded-none font-mono text-xs h-9 w-[240px]"
							/>

							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase"
								disabled={visualTemplateHistory.past.length === 0}
								title="Undo (Ctrl/Cmd+Z)"
								onClick={() => undoVisualTemplate()}
							>
								Undo
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase"
								disabled={visualTemplateHistory.future.length === 0}
								title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
								onClick={() => redoVisualTemplate()}
							>
								Redo
							</Button>

							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!selectedVersion}
								title="Reset to current version baseline"
								onClick={() => {
									if (!selectedVersion) return
									if (isDirty && !confirmDiscardChanges('reset')) return
									syncEditorFromVersion(selectedVersion)
									setNote('')
									setEditorScene('cover')
									setEditorSelectedKey('cover:[]')
									toast.message('Reset to version')
								}}
							>
								Reset
							</Button>

							<Button
								type="button"
								size="sm"
								variant={previewMode === 'edit' ? 'default' : 'outline'}
								className="rounded-none font-mono text-xs uppercase"
								onClick={() => setPreviewMode('edit')}
							>
								Edit
							</Button>
							<Button
								type="button"
								size="sm"
								variant={previewMode === 'play' ? 'default' : 'outline'}
								className="rounded-none font-mono text-xs uppercase"
								onClick={() => setPreviewMode('play')}
							>
								Play
							</Button>

							<Button
								type="button"
								size="sm"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								onClick={() => {
									const next = !showAdvanced
									if (next && layout.rightCollapsed) setRightCollapsed(false)
									setShowAdvanced(next)
								}}
								title="Toggle JSON panel"
							>
								{showAdvanced ? 'Hide JSON' : 'JSON'}
							</Button>

							<Button
								type="button"
								size="sm"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								title="Shortcuts (Shift+/)"
								onClick={() => setShortcutsOpen(true)}
							>
								?
							</Button>

							<Button
								type="button"
								size="sm"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!canPublish}
								title={
									publishDisabledReason
										? `Publish disabled: ${publishDisabledReason}`
										: 'Publish (Ctrl/Cmd+Enter)'
								}
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
								{publishMutation.isPending ? 'Publishing…' : 'Publish'}
							</Button>

							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								onClick={() => {
									if (!confirmDiscardChanges('leave')) return
									void navigate({ to: '/thread-templates' })
								}}
							>
								Back
							</Button>
						</div>
					</div>

					{publishDisabledReason ? (
						<div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							Publish disabled: {publishDisabledReason}
						</div>
					) : null}
				</div>
			</div>

			<div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
				<div
					ref={containerRef}
					className="grid grid-cols-1 gap-x-6 gap-y-6 lg:gap-x-0 lg:grid-cols-[var(--tte-left)_8px_1fr_8px_var(--tte-right)]"
					style={
						{
							'--tte-left': `${leftColPx}px`,
							'--tte-right': `${rightColPx}px`,
						} as React.CSSProperties
					}
				>
					<ThreadTemplateVisualEditor
						layout="panels"
						structureClassName="order-1 lg:order-none lg:col-start-1 lg:col-end-2 lg:row-start-1"
						propertiesClassName="order-3 lg:order-none lg:col-start-5 lg:col-end-6 lg:row-start-1"
						structureCollapsed={layout.leftCollapsed}
						onStructureCollapsedChange={setLeftCollapsed}
						propertiesCollapsed={layout.rightCollapsed}
						onPropertiesCollapsedChange={setRightCollapsed}
						value={visualTemplateConfig}
						baselineValue={selectedVersionConfig ?? undefined}
						onChange={(next) =>
							setVisualTemplateConfig(normalizeThreadTemplateConfig(next))
						}
						assets={previewAssets as any}
						historyState={visualTemplateHistory}
						setHistoryState={setVisualTemplateHistory}
						resetKey={String(selectedVersion?.id ?? '')}
						scene={editorScene}
						onSceneChange={(s) => setEditorScene(s)}
						selectedKey={editorSelectedKey}
						onSelectedKeyChange={(key) => {
							setEditorSelectedKey(key)
							const s = sceneFromNodeKey(key)
							if (s) setEditorScene((prev) => (prev === s ? prev : s))
						}}
					/>

					<div
						className="hidden lg:flex lg:col-start-2 lg:col-end-3 lg:row-start-1 cursor-col-resize items-stretch justify-center select-none touch-none"
						onPointerDown={(e) => startResize('left', e)}
						onDoubleClick={() => {
							setLayout((prev) => ({
								...prev,
								leftPx: 360,
								leftCollapsed: false,
							}))
						}}
						title="Drag to resize (double-click to reset)"
					>
						<div className="w-full bg-border/60 hover:bg-border" />
					</div>

					<div className="order-2 space-y-4 lg:order-none lg:col-start-3 lg:col-end-4 lg:row-start-1">
						<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							Preview
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
								onEditCanvasConfigChange={(next) => {
									applyVisualTemplateConfigExternal(next)
								}}
								onEditCanvasTransaction={(phase) => {
									if (phase === 'start') beginVisualTemplateTxn()
									else endVisualTemplateTxn()
								}}
								showLayers={false}
								showInspector={false}
								externalPrimaryKey={editorSelectedKey}
								onSelectionChange={({ primaryKey }) => {
									if (!primaryKey) return
									setEditorSelectedKey(primaryKey)
									const s = sceneFromNodeKey(primaryKey)
									if (s) setEditorScene((prev) => (prev === s ? prev : s))
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

						{previewThreadId && previewThreadQuery.isError ? (
							<div className="font-mono text-xs text-destructive">
								Failed to load preview thread.
							</div>
						) : null}

						{previewThreadId &&
						!previewRoot &&
						!previewThreadQuery.isLoading ? (
							<div className="font-mono text-xs text-muted-foreground">
								Preview thread has no root post (or failed to load).
							</div>
						) : null}
					</div>

					<div
						className="hidden lg:flex lg:col-start-4 lg:col-end-5 lg:row-start-1 cursor-col-resize items-stretch justify-center select-none touch-none"
						onPointerDown={(e) => startResize('right', e)}
						onDoubleClick={() => {
							setLayout((prev) => ({
								...prev,
								rightPx: 420,
								rightCollapsed: false,
							}))
						}}
						title="Drag to resize (double-click to reset)"
					>
						<div className="w-full bg-border/60 hover:bg-border" />
					</div>

					{showAdvanced ? (
						<Card className="order-4 rounded-none lg:order-none lg:col-start-5 lg:col-end-6 lg:row-start-2">
							<CardHeader>
								<CardTitle className="font-mono text-sm uppercase tracking-widest">
									Config (read-only JSON)
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								<Textarea
									value={toPrettyJson(visualTemplateConfig)}
									readOnly
									className="min-h-[260px] rounded-none font-mono text-xs"
								/>
								<div className="font-mono text-xs text-muted-foreground">
									This is the normalized config used for preview/publish.
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	)
}
