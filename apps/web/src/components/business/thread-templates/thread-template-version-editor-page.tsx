'use client'

import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import { DEFAULT_THREAD_TEMPLATE_CONFIG } from '@app/remotion-project/thread-template-config'
import type { ThreadTemplateConfigV1 } from '@app/remotion-project/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
    ArrowLeft,
    Code2,
    History,
    Keyboard,
    ListTree,
    Maximize,
    Minimize,
    Minus,
    MonitorPlay,
    MousePointer2,
    PanelRightClose,
    PanelRightOpen,
    Play,
    Plus,
    Redo2,
    Save,
    SlidersHorizontal,
    Undo2,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import {
    ThreadRemotionEditorSurface,
    ThreadRemotionTimeline,
    type ThreadRemotionEditorSurfaceApi,
} from '~/components/business/threads/thread-remotion-editor-surface'
import { ThreadRemotionPlayerCard } from '~/components/business/threads/thread-remotion-player-card'
import { ThreadTemplateVisualEditor } from '~/components/business/threads/thread-template-visual-editor'
import { Button } from '~/components/ui/button'
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
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Textarea } from '~/components/ui/textarea'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '~/components/ui/tooltip'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { useLocalStorageState } from '~/lib/shared/hooks/useLocalStorageState'
import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc/client'

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
	const raw = coerceJsonValue(row?.templateConfig)
	if (!isPlainObject(raw) || (raw as any).version !== 1) return null
	return raw as ThreadTemplateConfigV1
}

type ThreadTemplateCanvasToolbarProps = {
	t: (key: string, vars?: Record<string, unknown>) => string
	editorScene: 'cover' | 'post'
	onEditorSceneChange: (scene: 'cover' | 'post') => void
	previewMode: 'edit' | 'play'
	onPreviewModeChange: (mode: 'edit' | 'play') => void
	zoom: number
	onZoomChange: (next: number) => void
	onResetView: () => void
	focusMode: boolean
	onToggleFocusMode: () => void
	canUndo: boolean
	canRedo: boolean
	onUndo: () => void
	onRedo: () => void
}


function ThreadTemplateFloatingToolbar({
	t,
	editorScene,
	onEditorSceneChange,
	previewMode,
	onPreviewModeChange,
	zoom,
	onZoomChange,
	onResetView,
	focusMode,
	onToggleFocusMode,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
}: ThreadTemplateCanvasToolbarProps) {
	const canZoom = previewMode === 'edit'
	return (
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-xl shadow-black/5 z-40 transition-all hover:bg-background/90 hover:shadow-2xl hover:scale-105 active:scale-100">
			{/* Scene Toggles */}
			<div className="flex items-center bg-muted/50 rounded-full p-0.5">
				<button
					type="button"
					onClick={() => onEditorSceneChange('cover')}
					className={[
						'px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all',
						editorScene === 'cover'
							? 'bg-background text-foreground font-bold shadow-sm ring-1 ring-black/5'
							: 'text-muted-foreground hover:text-foreground',
					].join(' ')}
				>
					{t('structure.cover')}
				</button>
				<button
					type="button"
					onClick={() => onEditorSceneChange('post')}
					className={[
						'px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all',
						editorScene === 'post'
							? 'bg-background text-foreground font-bold shadow-sm ring-1 ring-black/5'
							: 'text-muted-foreground hover:text-foreground',
					].join(' ')}
				>
					{t('structure.post')}
				</button>
			</div>

			<div className="w-px h-4 bg-border/50 mx-1" />

			{/* Undo / Redo */}
			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 rounded-full hover:bg-muted/80"
							disabled={!canUndo}
							onClick={onUndo}
						>
							<Undo2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="font-mono text-[10px] uppercase"
					>
						{t('tooltips.undo')} (Cmd+Z)
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 rounded-full hover:bg-muted/80"
							disabled={!canRedo}
							onClick={onRedo}
						>
							<Redo2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="font-mono text-[10px] uppercase"
					>
						{t('tooltips.redo')} (Cmd+Shift+Z)
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="w-px h-4 bg-border/50 mx-1" />

			{/* Preview Mode */}
			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={previewMode === 'edit' ? 'secondary' : 'ghost'}
							size="icon"
							className="size-8 rounded-full"
							onClick={() => onPreviewModeChange('edit')}
						>
							<MousePointer2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="font-mono text-[10px] uppercase"
					>
						{t('buttons.edit')}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={previewMode === 'play' ? 'secondary' : 'ghost'}
							size="icon"
							className="size-8 rounded-full"
							onClick={() => onPreviewModeChange('play')}
						>
							<Play className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="font-mono text-[10px] uppercase"
					>
						{t('buttons.play')}
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="w-px h-4 bg-border/50 mx-1" />

			{/* Zoom Controls */}
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					className="size-8 rounded-full hover:bg-muted/80"
					disabled={!canZoom}
					onClick={() => onZoomChange(Math.max(0.25, zoom / 1.1))}
				>
					<Minus className="size-3.5" />
				</Button>
				<button
					type="button"
					className="w-10 text-center text-[10px] font-mono font-medium text-foreground/80 select-none disabled:opacity-50"
					disabled={!canZoom}
					onDoubleClick={onResetView}
					title={t('tooltips.resetView')}
				>
					{Math.round(zoom * 100)}%
				</button>
				<Button
					variant="ghost"
					size="icon"
					className="size-8 rounded-full hover:bg-muted/80"
					disabled={!canZoom}
					onClick={() => onZoomChange(Math.min(4, zoom * 1.1))}
				>
					<Plus className="size-3.5" />
				</Button>
			</div>

			<div className="w-px h-4 bg-border/50 mx-1" />

			{/* Focus Mode */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant={focusMode ? 'secondary' : 'ghost'}
						size="icon"
						className="size-8 rounded-full"
						onClick={onToggleFocusMode}
					>
						{focusMode ? (
							<Minimize className="size-4" />
						) : (
							<Maximize className="size-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					className="font-mono text-[10px] uppercase"
				>
					{focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
				</TooltipContent>
			</Tooltip>
		</div>
	)
}


export function ThreadTemplateVersionEditorPage({
	libraryId,
	versionId,
	previewThreadId = '',
}: {
	libraryId: string
	versionId: string
	previewThreadId?: string
}) {
	const navigate = useNavigate()
	const qc = useQueryClient()
	const t = useTranslations('ThreadTemplates.editor')

	type EditorLayoutState = {
		inspectorPx: number
		inspectorCollapsed: boolean
	}

	const [layout, setLayout] = useLocalStorageState<EditorLayoutState>(
		'vg.threadTemplateEditor.layout.v1',
		{
			version: 2,
			defaultValue: {
				inspectorPx: 360,
				inspectorCollapsed: false,
			},
			migrate: (stored, storedVersion) => {
				if (!stored || typeof stored !== 'object') return null

				if (storedVersion === 1) {
					const rightPx = Number((stored as any).rightPx)
					const rightCollapsed = Boolean((stored as any).rightCollapsed)
					if (!Number.isFinite(rightPx)) return null
					return {
						inspectorPx: Math.max(280, Math.min(720, rightPx)),
						inspectorCollapsed: rightCollapsed,
					}
				}

				const inspectorPx = Number((stored as any).inspectorPx)
				const inspectorCollapsed = Boolean((stored as any).inspectorCollapsed)
				if (!Number.isFinite(inspectorPx)) return null
				return {
					inspectorPx: Math.max(280, Math.min(720, inspectorPx)),
					inspectorCollapsed,
				}
			},
		},
	)

	React.useEffect(() => {
		setLayout((prev) => {
			if (!prev.inspectorCollapsed) return prev
			return { ...prev, inspectorCollapsed: false }
		})
	}, [setLayout])

	const containerRef = React.useRef<HTMLDivElement | null>(null)
	const dragRef = React.useRef<{
		startX: number
		startInspector: number
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
	const [canvasZoom, setCanvasZoom] = useLocalStorageState<number>(
		'vg.threadTemplateEditor.canvasZoom.v1',
		{
			version: 1,
			defaultValue: 1,
			migrate: (stored) => {
				const n = Number(stored)
				if (!Number.isFinite(n)) return null
				return Math.max(0.25, Math.min(4, n))
			},
		},
	)

	const canvasEditorRef = React.useRef<ThreadRemotionEditorSurfaceApi | null>(
		null,
	)

	const [editorScene, setEditorScene] = React.useState<'cover' | 'post'>(
		'cover',
	)
	const [editorSelectedKey, setEditorSelectedKey] =
		React.useState<string>('cover:[]')

	const [previewMode, setPreviewMode] = React.useState<'edit' | 'play'>('edit')
	const timeline = React.useMemo(() => {
		const commentsForTiming = previewReplies.map((r: any) => ({
			id: r.id,
			author: r.authorName,
			content: r.plainText,
			likes: Number(r.metrics?.likes ?? 0) || 0,
			replyCount: 0,
		}))
		return buildCommentTimeline(commentsForTiming, REMOTION_FPS)
	}, [previewReplies])
	const maxFrame = Math.max(0, timeline.totalDurationInFrames - 1)
	const [editFrame, setEditFrame] = React.useState(0)
	React.useEffect(() => {
		setEditFrame((prev) => Math.min(Math.max(0, prev), maxFrame))
	}, [maxFrame])
	const canScrubTimeline =
		previewMode === 'edit' &&
		Boolean(previewThreadId) &&
		Boolean(previewThread) &&
		Boolean(previewRoot)
	const [inspectorTab, setInspectorTab] = React.useState<
		'structure' | 'properties' | 'config'
	>('properties')
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

	const selectedVersionConfig = React.useMemo(() => {
		if (!selectedVersion) return null
		return (
			toConfigFromVersionRow(selectedVersion) ?? DEFAULT_THREAD_TEMPLATE_CONFIG
		)
	}, [selectedVersion?.id])

	const selectedVersionConfigJson = React.useMemo(() => {
		if (!selectedVersionConfig) return null
		return JSON.stringify(selectedVersionConfig)
	}, [selectedVersionConfig])

	const visualTemplateConfigJson = React.useMemo(
		() => JSON.stringify(visualTemplateConfig),
		[visualTemplateConfig],
	)

	const isDirty = React.useMemo(() => {
		if (!selectedVersionConfigJson) return false
		return selectedVersionConfigJson !== visualTemplateConfigJson
	}, [selectedVersionConfigJson, visualTemplateConfigJson])

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

	function confirmDiscardChanges(action: 'switchVersions' | 'reset' | 'leave') {
		if (!isDirty) return true
		const actionLabel = t(`confirm.actions.${action}`)
		return window.confirm(t('confirm.discard', { action: actionLabel }))
	}

	function applyVisualTemplateConfigExternal(next: ThreadTemplateConfigV1) {
		setVisualTemplateConfig((prev) => {
			const txn = visualTxnRef.current
			if (!txn) {
				setVisualTemplateHistory((h) => ({
					past: [...h.past, prev],
					future: [],
				}))
			}
			return next
		})
	}

	function beginVisualTemplateTxn() {
		if (visualTxnRef.current) return
		visualTxnRef.current = { base: visualTemplateConfigRef.current }
	}

	function endVisualTemplateTxn() {
		const txn = visualTxnRef.current
		visualTxnRef.current = null
		if (!txn) return
		const before = JSON.stringify(txn.base)
		const after = JSON.stringify(visualTemplateConfigRef.current)
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
			successToast: t('toasts.publishedNewVersion'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const publishDisabledReason = !library
		? t('states.loadingTemplate')
		: publishMutation.isPending
			? t('states.publishing')
			: !previewThreadId
				? t('states.previewThreadRequired')
				: null

	const canPublish =
		!publishDisabledReason && Boolean(visualTemplateConfig) && Boolean(library)

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

	const inspectorRailPx = 40
	const inspectorColPx = layout.inspectorCollapsed
		? inspectorRailPx
		: layout.inspectorPx

	function setInspectorCollapsed(collapsed: boolean) {
		setLayout((prev) => ({ ...prev, inspectorCollapsed: collapsed }))
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
				setLayout((prev) => ({
					...prev,
					inspectorCollapsed: !prev.inspectorCollapsed,
				}))
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

	function startResizeInspector(e: React.PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		const container = containerRef.current
		if (!container) return

		const rect = container.getBoundingClientRect()
		dragRef.current = {
			startX: e.clientX,
			startInspector: layout.inspectorPx,
			rect,
		}

		if (layout.inspectorCollapsed) setInspectorCollapsed(false)

		const onMove = (ev: PointerEvent) => {
			const drag = dragRef.current
			if (!drag) return

			const dx = ev.clientX - drag.startX
			const width = drag.rect.width

			const minInspector = 300
			const minCenter = 480
			const handle = 8

			const maxInspector = Math.max(minInspector, width - minCenter - handle)
			const nextInspector = Math.round(
				Math.min(
					maxInspector,
					Math.max(minInspector, drag.startInspector - dx),
				),
			)

			setLayout((prev) => {
				if (
					prev.inspectorPx === nextInspector &&
					prev.inspectorCollapsed === false
				)
					return prev
				return {
					...prev,
					inspectorPx: nextInspector,
					inspectorCollapsed: false,
				}
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
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col bg-muted/5 font-sans text-foreground overflow-hidden">
				<Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
					<DialogContent className="rounded-2xl border-none shadow-2xl sm:max-w-xl bg-background/95 backdrop-blur-xl">
						<DialogHeader>
							<DialogTitle className="font-mono uppercase tracking-widest text-sm text-foreground/70">
								{t('shortcuts.title')}
							</DialogTitle>
							<DialogDescription className="font-mono text-xs text-muted-foreground">
								{t('shortcuts.description')}
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2 mt-4">
							<div className="grid grid-cols-1 gap-2">
								<div className="flex items-center justify-between border-b border-border/40 pb-2 font-mono text-xs">
									<div className="text-muted-foreground">{t('shortcuts.rows.undo')}</div>
									<div className="bg-muted px-1.5 py-0.5 rounded text-foreground">Ctrl/Cmd + Z</div>
								</div>
								<div className="flex items-center justify-between border-b border-border/40 pb-2 font-mono text-xs">
									<div className="text-muted-foreground">{t('shortcuts.rows.redo')}</div>
									<div className="bg-muted px-1.5 py-0.5 rounded text-foreground">Ctrl/Cmd + Shift + Z</div>
								</div>
								<div className="flex items-center justify-between border-b border-border/40 pb-2 font-mono text-xs">
									<div className="text-muted-foreground">{t('shortcuts.rows.toggleStructure')}</div>
									<div className="bg-muted px-1.5 py-0.5 rounded text-foreground">Ctrl/Cmd + \</div>
								</div>
								<div className="flex items-center justify-between font-mono text-xs">
									<div className="text-muted-foreground">{t('shortcuts.rows.publish')}</div>
									<div className="bg-muted px-1.5 py-0.5 rounded text-foreground">Ctrl/Cmd + Enter</div>
								</div>
							</div>
						</div>
					</DialogContent>
				</Dialog>

				{/* HEADER */}
				<header className="flex h-14 shrink-0 items-center justify-between bg-background border-b border-border/40 px-4 z-30 relative">
					{/* LEFT: Context */}
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-3">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => {
									if (!confirmDiscardChanges('leave')) return
									void navigate({ to: '/thread-templates' })
								}}
								title={t('buttons.back')}
							>
								<ArrowLeft className="size-4" />
							</Button>
							
							<div className="flex flex-col">
								<div className="flex items-center gap-2">
									<h1 className="font-semibold text-sm tracking-tight truncate max-w-[200px]">
										{library ? String((library as any).name) : '…'}
									</h1>
									{isDirty && (
										<span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
									)}
								</div>
								<div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider">
									<span>
										{selectedVersion
											? t('header.versionTag', {
													version: Number((selectedVersion as any).version),
												})
											: t('header.versionTagUnknown')}
									</span>
								</div>
							</div>
						</div>

						<div className="h-4 w-px bg-border/40" />

						{/* Version Selector */}
						<Select
							value={String(versionId)}
							disabled={versionsQuery.isLoading || versions.length === 0}
							onValueChange={(v) => {
								if (String(v) === String(versionId)) return
								if (!confirmDiscardChanges('switchVersions')) return
								void navigate({
									to: '/thread-templates/$libraryId/versions/$versionId/editor',
									params: { libraryId, versionId: v },
									search: { previewThreadId },
								})
							}}
						>
							<SelectTrigger className="h-7 w-auto min-w-[100px] rounded-full border border-border/30 bg-muted/30 font-mono text-xs shadow-none hover:bg-muted/50 focus:ring-0 px-2.5 gap-2 transition-all">
								<History className="size-3 text-muted-foreground" />
								<SelectValue placeholder={t('controls.versionPlaceholder')} />
							</SelectTrigger>
							<SelectContent>
								{versions.map((v: any) => (
									<SelectItem
										key={String(v.id)}
										value={String(v.id)}
										className="font-mono text-xs"
									>
										v{Number(v.version)}{' '}
										<span className="text-muted-foreground text-[10px] ml-1">
											· {String(v.id).slice(0, 8)}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* RIGHT: Actions */}
					<div className="flex items-center gap-3">
						{/* Thread Preview Context */}
						<div className="hidden lg:flex items-center gap-2">
							<Select
								value={previewThreadId || ''}
								onValueChange={(v) => {
									void navigate({ search: { previewThreadId: v } })
								}}
							>
								<SelectTrigger className="h-8 max-w-[200px] rounded-full font-mono text-xs bg-muted/30 border-transparent hover:bg-muted/50 focus:ring-0 gap-2 transition-colors">
									<MonitorPlay className="size-3.5 text-muted-foreground" />
									<span className="truncate">
										<SelectValue
											placeholder={t('controls.previewThreadPlaceholder')}
										/>
									</span>
								</SelectTrigger>
								<SelectContent align="end">
									{threads.map((t: any) => (
										<SelectItem
											key={String(t.id)}
											value={String(t.id)}
											className="font-mono text-xs"
										>
											<span className="truncate block max-w-[240px]">
												{String(t.title || t.id)}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="h-4 w-px bg-border/40" />

						<div className="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 rounded-full hover:bg-muted"
										onClick={() => setShortcutsOpen(true)}
									>
										<Keyboard className="size-4 text-muted-foreground" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="bottom"
									className="font-mono text-[10px] uppercase"
								>
									{t('tooltips.shortcuts')}
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 rounded-full hover:bg-muted"
										disabled={!selectedVersion}
										onClick={() => {
											if (!selectedVersion) return
											if (isDirty && !confirmDiscardChanges('reset')) return
											syncEditorFromVersion(selectedVersion)
											setNote('')
											setEditorScene('cover')
											setEditorSelectedKey('cover:[]')
											toast.message(t('toasts.resetToVersion'))
										}}
									>
										<History className="size-4 text-muted-foreground" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="bottom"
									className="font-mono text-[10px] uppercase"
								>
									{t('buttons.reset')}
								</TooltipContent>
							</Tooltip>
						</div>

						<div className="flex items-center gap-2 pl-2">
							<Input
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder={t('controls.publishNotePlaceholder')}
								className="h-8 w-[180px] rounded-full font-mono text-xs bg-muted/30 border-transparent hover:bg-muted/50 focus:bg-background focus:border-primary/20 transition-all placeholder:text-muted-foreground/50"
							/>
							<Button
								type="button"
								size="sm"
								className="h-8 rounded-full font-mono text-xs font-semibold uppercase tracking-wide gap-2 px-4 shadow-sm"
								disabled={!canPublish}
								onClick={() => {
									if (!library) return
									if (!previewThreadId) {
										toast.error(t('toasts.pickPreviewThreadFirst'))
										return
									}
									publishMutation.mutate({
										libraryId,
										templateConfig: visualTemplateConfigRef.current,
										note: note.trim() || undefined,
										sourceThreadId: previewThreadId,
									})
								}}
							>
								{publishMutation.isPending ? (
									<span className="animate-spin">⟳</span>
								) : (
									<Save className="size-3.5" />
								)}
								{t('buttons.publish')}
							</Button>
						</div>
					</div>
				</header>

				{/* WORKSPACE */}
				<div className="flex-1 overflow-hidden relative">
					<div
						ref={containerRef}
						className="h-full grid grid-cols-1 lg:grid-cols-[1fr_auto_var(--tte-right)]"
						style={
							{
								'--tte-right': `${inspectorColPx}px`,
							} as React.CSSProperties
						}
					>
						{/* CENTER CANVAS */}
						<div className="order-1 lg:order-none lg:col-start-1 lg:col-end-2 lg:row-start-1 h-full overflow-hidden flex flex-col min-h-0 bg-muted/5 relative group/canvas">
							


							<div className="flex-1 min-h-0 relative overflow-hidden">
								{/* Floating Toolbar */}
								<ThreadTemplateFloatingToolbar
									t={t}
									editorScene={editorScene}
									onEditorSceneChange={(s) => {
										setEditorScene(s)
										setEditorSelectedKey(`${s}:[]`)
									}}
									previewMode={previewMode}
									onPreviewModeChange={(m) => setPreviewMode(m)}
									zoom={canvasZoom}
									onZoomChange={(next) => canvasEditorRef.current?.setZoom(next)}
									onResetView={() => canvasEditorRef.current?.resetView()}
									focusMode={layout.inspectorCollapsed}
									onToggleFocusMode={() => {
										setInspectorCollapsed(!layout.inspectorCollapsed)
									}}
									canUndo={visualTemplateHistory.past.length > 0}
									canRedo={visualTemplateHistory.future.length > 0}
									onUndo={undoVisualTemplate}
									onRedo={redoVisualTemplate}
								/>

								{/* Canvas Background Pattern */}
								<div
									className="absolute inset-0 opacity-[0.02] pointer-events-none"
									style={{
										backgroundImage:
											'radial-gradient(circle, currentColor 1px, transparent 1px)',
										backgroundSize: '24px 24px',
									}}
								/>

								<div className="h-full overflow-auto">
									<div className="min-h-full flex items-center justify-center p-8 lg:p-12 relative pb-28">
										<div className="origin-center w-full max-w-[720px] xl:max-w-[840px] 2xl:max-w-[960px] flex flex-col items-center justify-center transition-all duration-300">
											<div className="relative w-full shadow-2xl shadow-black/20 bg-black rounded-lg overflow-hidden ring-1 ring-black/5 transition-all duration-500 hover:shadow-3xl">
												{previewMode === 'edit' ? (
													<ThreadRemotionEditorSurface
														ref={canvasEditorRef}
														thread={previewThread as any}
														root={previewRoot as any}
														replies={previewReplies as any}
														scene={editorScene}
														assets={previewAssets as any}
														audio={
															previewAudio?.url &&
															previewAudio?.asset?.durationMs
																? {
																		url: String(previewAudio.url),
																		durationMs: Number(
																			previewAudio.asset.durationMs,
																		),
																	}
																: null
														}
														isLoading={previewThreadQuery.isLoading}
														templateId={(library as any)?.templateId as any}
														templateConfig={visualTemplateConfig as any}
														editCanvasConfig={visualTemplateConfig as any}
														onEditCanvasConfigChange={(next) => {
															applyVisualTemplateConfigExternal(next)
														}}
														initialViewScale={canvasZoom}
														onViewScaleChange={setCanvasZoom}
														onEditCanvasTransaction={(phase) => {
															if (phase === 'start') beginVisualTemplateTxn()
															else endVisualTemplateTxn()
														}}
														showLayers={false}
														showInspector={false}
														externalEditFrame={editFrame}
														onEditFrameChange={setEditFrame}
														externalPrimaryKey={editorSelectedKey}
														onSelectionChange={({ primaryKey }) => {
															if (!primaryKey) return
															setEditorSelectedKey(primaryKey)
															const s = sceneFromNodeKey(primaryKey)
															if (s)
																setEditorScene((prev) =>
																	prev === s ? prev : s,
																)
														}}
													/>
												) : (
													<ThreadRemotionPlayerCard
														thread={previewThread as any}
														root={previewRoot as any}
														replies={previewReplies as any}
														assets={previewAssets as any}
														audio={
															previewAudio?.url &&
															previewAudio?.asset?.durationMs
																? {
																		url: String(previewAudio.url),
																		durationMs: Number(
																			previewAudio.asset.durationMs,
																		),
																	}
																: null
														}
														isLoading={previewThreadQuery.isLoading}
														templateId={(library as any)?.templateId as any}
														templateConfig={visualTemplateConfig as any}
													/>
												)}
											</div>
										</div>
									</div>
								</div>

								{/* Canvas Messages */}
								<div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-2 z-10 w-full max-w-sm">
									{previewThreadId && previewThreadQuery.isError ? (
										<div className="font-mono text-xs text-destructive bg-destructive/5 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-destructive/10 animate-in fade-in slide-in-from-top-2">
											{t('panels.previewLoadFailed')}
										</div>
									) : null}

									{previewThreadId &&
									!previewRoot &&
									!previewThreadQuery.isLoading ? (
										<div className="font-mono text-xs text-muted-foreground bg-background/50 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-border/50 animate-in fade-in slide-in-from-top-2">
											{t('panels.previewNoRoot')}
										</div>
									) : null}
								</div>
							</div>

							{canScrubTimeline ? (
								<div className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-xl px-4 py-3 z-30">
									<ThreadRemotionTimeline
										scene={editorScene}
										timeline={timeline}
										editFrame={editFrame}
										onEditFrameChange={setEditFrame}
										disabled={previewThreadQuery.isLoading}
									/>
								</div>
							) : null}
						</div>

						{/* INSPECTOR RESIZER */}
						<div
							className="hidden lg:flex lg:col-start-2 lg:col-end-3 lg:row-start-1 cursor-col-resize items-center justify-center select-none touch-none hover:bg-accent/50 transition-colors z-20 w-2 -ml-1"
							onPointerDown={(e) => startResizeInspector(e)}
							onDoubleClick={() => {
								setLayout((prev) => ({
									...prev,
									inspectorPx: 360,
									inspectorCollapsed: false,
								}))
							}}
						>
							<div className="h-8 w-1 rounded-full bg-border/50 hover:bg-border transition-colors" />
						</div>

						{/* INSPECTOR PANEL */}
						<div className="order-2 lg:order-none lg:col-start-3 lg:col-end-4 lg:row-start-1 h-full overflow-hidden border-l border-border/40 bg-background flex flex-col shadow-xl shadow-black/5 z-20">
							{layout.inspectorCollapsed ? (
								<div className="h-full flex flex-col items-center gap-4 py-4 bg-muted/10">
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-9 rounded-xl hover:bg-muted"
												onClick={() => setInspectorCollapsed(false)}
											>
												<PanelRightOpen className="size-4 text-muted-foreground" />
											</Button>
										</TooltipTrigger>
										<TooltipContent
											side="left"
											className="font-mono text-[10px] uppercase"
										>
											{t('panels.expand')}
										</TooltipContent>
									</Tooltip>

									<div className="w-4 h-px bg-border/40" />

									<div className="flex flex-col items-center gap-2">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant={
														inspectorTab === 'structure' ? 'secondary' : 'ghost'
													}
													size="icon"
													className="size-9 rounded-xl transition-all"
													onClick={() => {
														setInspectorTab('structure')
														setInspectorCollapsed(false)
													}}
												>
													<ListTree className="size-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent
												side="left"
												className="font-mono text-[10px] uppercase"
											>
												{t('panels.structureShortTitle')}
											</TooltipContent>
										</Tooltip>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant={
														inspectorTab === 'properties'
															? 'secondary'
															: 'ghost'
													}
													size="icon"
													className="size-9 rounded-xl transition-all"
													onClick={() => {
														setInspectorTab('properties')
														setInspectorCollapsed(false)
													}}
												>
													<SlidersHorizontal className="size-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent
												side="left"
												className="font-mono text-[10px] uppercase"
											>
												{t('panels.propertiesShortTitle')}
											</TooltipContent>
										</Tooltip>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant={
														inspectorTab === 'config' ? 'secondary' : 'ghost'
													}
													size="icon"
													className="size-9 rounded-xl transition-all"
													onClick={() => {
														setInspectorTab('config')
														setInspectorCollapsed(false)
													}}
												>
													<Code2 className="size-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent
												side="left"
												className="font-mono text-[10px] uppercase"
											>
												{t('panels.configShortTitle')}
											</TooltipContent>
										</Tooltip>
									</div>
								</div>
							) : (
								<>
									{/* Tab Header */}
									<div className="shrink-0 border-b border-border/40 px-3 py-3 flex items-center gap-3">
										<Tabs
											value={inspectorTab}
											className="flex-1 gap-0"
											onValueChange={(v) =>
												setInspectorTab(
													v as 'structure' | 'properties' | 'config',
												)
											}
										>
											<TabsList className="w-full h-9 bg-muted/30 p-1 rounded-lg">
												<TabsTrigger
													value="structure"
													className="flex-1 h-full font-mono text-[10px] font-semibold uppercase tracking-wider rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
												>
													{t('panels.structureShortTitle')}
												</TabsTrigger>
												<TabsTrigger
													value="properties"
													className="flex-1 h-full font-mono text-[10px] font-semibold uppercase tracking-wider rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
												>
													{t('panels.propertiesShortTitle')}
												</TabsTrigger>
												<TabsTrigger
													value="config"
													className="flex-1 h-full font-mono text-[10px] font-semibold uppercase tracking-wider rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
												>
													{t('panels.configShortTitle')}
												</TabsTrigger>
											</TabsList>
										</Tabs>

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-7 rounded-sm active:scale-95 transition-transform"
													onClick={() => setInspectorCollapsed(true)}
												>
													<PanelRightClose className="size-4 text-muted-foreground" />
												</Button>
											</TooltipTrigger>
											<TooltipContent
												side="left"
												className="font-mono text-[10px] uppercase"
											>
												{t('panels.collapse')}
											</TooltipContent>
										</Tooltip>
									</div>

									{/* Tab Content */}
									{inspectorTab === 'config' ? (
										<div className="flex-1 p-3 min-h-0 bg-muted/5">
											<Textarea
												value={toPrettyJson(visualTemplateConfig)}
												readOnly
												className="h-full w-full resize-none rounded-md font-mono text-xs bg-background border-border/40 focus-visible:ring-1 focus-visible:ring-primary/20 p-3 leading-relaxed"
											/>
										</div>
									) : inspectorTab === 'structure' ? (
										<div className="flex-1 min-h-0 overflow-hidden bg-background">
											<ThreadTemplateVisualEditor
												layout="panels"
												structureClassName="h-full"
												propertiesClassName="hidden"
												showSceneToggle={false}
												value={visualTemplateConfig}
												baselineValue={selectedVersionConfig ?? undefined}
												onChange={(next) => setVisualTemplateConfig(next)}
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
													if (s)
														setEditorScene((prev) => (prev === s ? prev : s))
												}}
											/>
										</div>
									) : (
										<div className="flex-1 min-h-0 overflow-hidden bg-background">
											<ThreadTemplateVisualEditor
												layout="panels"
												structureClassName="hidden"
												propertiesClassName="h-full"
												value={visualTemplateConfig}
												baselineValue={selectedVersionConfig ?? undefined}
												onChange={(next) => setVisualTemplateConfig(next)}
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
													if (s)
														setEditorScene((prev) => (prev === s ? prev : s))
												}}
											/>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	)
}
