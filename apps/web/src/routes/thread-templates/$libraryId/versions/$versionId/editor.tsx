import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import {
	ArrowLeft,
	Code2,
	History,
	Keyboard,
	Maximize,
	Minimize,
	Minus,
	MonitorPlay,
	MousePointer2,
	Play,
	Plus,
	Redo2,
	Save,
	Undo2,
	X,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ThreadRemotionEditorSurface } from '~/components/business/threads/thread-remotion-editor-surface'
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
import { Separator } from '~/components/ui/separator'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useLocalStorageState } from '~/lib/hooks/useLocalStorageState'
import { useTranslations } from '~/lib/i18n'
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

type ThreadTemplateCanvasToolbarProps = {
	t: (key: string, vars?: Record<string, unknown>) => string
	editorScene: 'cover' | 'post'
	onEditorSceneChange: (scene: 'cover' | 'post') => void
	previewMode: 'edit' | 'play'
	onPreviewModeChange: (mode: 'edit' | 'play') => void
	zoom: number
	onZoomChange: (next: number) => void
	focusMode: boolean
	onToggleFocusMode: () => void
}

function ThreadTemplateCanvasToolbar({
	t,
	editorScene,
	onEditorSceneChange,
	previewMode,
	onPreviewModeChange,
	zoom,
	onZoomChange,
	focusMode,
	onToggleFocusMode,
}: ThreadTemplateCanvasToolbarProps) {
	return (
		<div className="shrink-0 border-b border-border bg-card/70 backdrop-blur px-3 py-2">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex items-center p-1 rounded-full bg-background/80 border border-border/40 shadow-sm">
						<button
							type="button"
							onClick={() => onEditorSceneChange('cover')}
							className={[
								'px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all',
								editorScene === 'cover'
									? 'bg-foreground text-background font-bold shadow-sm'
									: 'text-muted-foreground hover:text-foreground',
							].join(' ')}
						>
							{t('structure.cover')}
						</button>
						<button
							type="button"
							onClick={() => onEditorSceneChange('post')}
							className={[
								'px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all',
								editorScene === 'post'
									? 'bg-foreground text-background font-bold shadow-sm'
									: 'text-muted-foreground hover:text-foreground',
							].join(' ')}
						>
							{t('structure.post')}
						</button>
					</div>

					<Separator orientation="vertical" className="h-5" />

					<div className="flex items-center px-1">
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
								side="bottom"
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
								side="bottom"
								className="font-mono text-[10px] uppercase"
							>
								{t('buttons.play')}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<div className="flex items-center px-1">
						<Button
							variant="ghost"
							size="icon"
							className="size-8 rounded-full"
							onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
							title={t('tooltips.zoomOut')}
						>
							<Minus className="size-4" />
						</Button>
						<span className="w-10 text-center text-[10px] font-mono text-muted-foreground select-none">
							{Math.round(zoom * 100)}%
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 rounded-full"
							onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
							title={t('tooltips.zoomIn')}
						>
							<Plus className="size-4" />
						</Button>
					</div>

					<Separator orientation="vertical" className="h-5" />

					<span className="text-[10px] font-mono text-muted-foreground opacity-50 select-none">
						1080×1920
					</span>
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
							side="bottom"
							className="font-mono text-[10px] uppercase"
						>
							{focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	)
}

function ThreadTemplateVersionEditorRoute() {
	const { libraryId, versionId } = Route.useParams()
	const { previewThreadId } = Route.useSearch()
	const navigate = Route.useNavigate()
	const qc = useQueryClient()
	const t = useTranslations('ThreadTemplates.editor')

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
				leftPx: 320,
				rightPx: 360,
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
	const [zoom, setZoom] = React.useState(1.0)

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

	function confirmDiscardChanges(action: 'switchVersions' | 'reset' | 'leave') {
		if (!isDirty) return true
		const actionLabel = t(`confirm.actions.${action}`)
		return window.confirm(t('confirm.discard', { action: actionLabel }))
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

	const leftRailPx = 40
	const rightRailPx = 40
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

			const minLeft = 260
			const minRight = 280
			const minCenter = 400
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
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col bg-background font-sans text-foreground overflow-hidden">
				<Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
					<DialogContent className="rounded-none sm:max-w-xl">
						<DialogHeader>
							<DialogTitle className="font-mono uppercase tracking-widest text-sm">
								{t('shortcuts.title')}
							</DialogTitle>
							<DialogDescription className="font-mono text-xs">
								{t('shortcuts.description')}
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2">
							<div className="grid grid-cols-1 gap-2">
								<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
									<div>{t('shortcuts.rows.undo')}</div>
									<div>Ctrl/Cmd + Z</div>
								</div>
								<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
									<div>{t('shortcuts.rows.redo')}</div>
									<div>Ctrl/Cmd + Shift + Z · Ctrl/Cmd + Y</div>
								</div>
								<div className="flex items-center justify-between border-b border-border pb-2 font-mono text-xs">
									<div>{t('shortcuts.rows.toggleStructure')}</div>
									<div>Ctrl/Cmd + \\</div>
								</div>
								<div className="flex items-center justify-between font-mono text-xs">
									<div>{t('shortcuts.rows.publish')}</div>
									<div>Ctrl/Cmd + Enter</div>
								</div>
							</div>
						</div>
					</DialogContent>
				</Dialog>

				{/* HEADER */}
				<header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3 z-30 relative">
					{/* LEFT: Context */}
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-8 rounded-none text-muted-foreground hover:text-foreground"
								onClick={() => {
									if (!confirmDiscardChanges('leave')) return
									void navigate({ to: '/thread-templates' })
								}}
								title={t('buttons.back')}
							>
								<ArrowLeft className="size-4" />
							</Button>
							<div className="flex flex-col">
								<h1 className="font-mono text-sm font-bold uppercase tracking-tight truncate max-w-[200px]">
									{library ? String((library as any).name) : '…'}
								</h1>
								<div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
									<span>
										{selectedVersion
											? `v${Number((selectedVersion as any).version)}`
											: 'v?'}
									</span>
									{isDirty && (
										<>
											<span className="size-1 rounded-full bg-amber-500" />
											<span className="text-amber-500">Unsaved</span>
										</>
									)}
								</div>
							</div>
						</div>
						
						<div className="h-6 w-px bg-border/60" />

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
							<SelectTrigger className="h-8 w-[140px] rounded-none border-0 bg-transparent font-mono text-xs shadow-none hover:bg-accent/50 focus:ring-0 px-2 gap-2">
								<History className="size-3.5 text-muted-foreground" />
								<SelectValue placeholder="Version" />
							</SelectTrigger>
							<SelectContent>
								{versions.map((v: any) => (
									<SelectItem key={String(v.id)} value={String(v.id)} className="font-mono text-xs">
										v{Number(v.version)} <span className="text-muted-foreground text-[10px] ml-1">· {String(v.id).slice(0, 8)}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* CENTER: Tools */}
					<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 rounded-md"
									disabled={visualTemplateHistory.past.length === 0}
									onClick={undoVisualTemplate}
								>
									<Undo2 className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="font-mono text-[10px] uppercase">
								{t('tooltips.undo')} (Cmd+Z)
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 rounded-md"
									disabled={visualTemplateHistory.future.length === 0}
									onClick={redoVisualTemplate}
								>
									<Redo2 className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="font-mono text-[10px] uppercase">
								{t('tooltips.redo')} (Cmd+Shift+Z)
							</TooltipContent>
						</Tooltip>
					</div>

					{/* RIGHT: Actions */}
					<div className="flex items-center gap-3">
						{/* Thread Preview Context */}
						<div className="hidden lg:flex items-center gap-2">
							<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Previewing</span>
							<Select
								value={previewThreadId || ''}
								onValueChange={(v) => {
									void navigate({ search: { previewThreadId: v } })
								}}
							>
								<SelectTrigger className="h-8 w-[200px] rounded-sm font-mono text-xs bg-muted/30 border-border/50 gap-2">
									<MonitorPlay className="size-3.5 text-muted-foreground" />
									<SelectValue placeholder="Select Thread..." />
								</SelectTrigger>
								<SelectContent align="end">
									{threads.map((t: any) => (
										<SelectItem key={String(t.id)} value={String(t.id)} className="font-mono text-xs">
											<span className="truncate block max-w-[240px]">{String(t.title || t.id)}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="h-6 w-px bg-border/60" />

						<div className="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={showAdvanced ? 'secondary' : 'ghost'}
										size="icon"
										className="size-8 rounded-sm"
										onClick={() => {
											const next = !showAdvanced
											if (next && layout.rightCollapsed) setRightCollapsed(false)
											setShowAdvanced(next)
										}}
									>
										<Code2 className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="font-mono text-[10px] uppercase">
									{showAdvanced ? t('buttons.hideJson') : t('buttons.json')}
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 rounded-sm"
										onClick={() => setShortcutsOpen(true)}
									>
										<Keyboard className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="font-mono text-[10px] uppercase">
									{t('tooltips.shortcuts')}
								</TooltipContent>
							</Tooltip>
							
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 rounded-sm"
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
										<History className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" className="font-mono text-[10px] uppercase">
									{t('buttons.reset')}
								</TooltipContent>
							</Tooltip>
						</div>

						<div className="flex items-center gap-2">
							<Input
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Publish note..."
								className="h-8 w-[160px] rounded-sm font-mono text-xs bg-muted/30 border-border/50 focus:bg-background transition-colors"
							/>
							<Button
								type="button"
								size="sm"
								className="h-8 rounded-sm font-mono text-xs uppercase gap-2"
								disabled={!canPublish}
								onClick={() => {
									if (!library) return
									if (!previewThreadId) {
										toast.error(t('toasts.pickPreviewThreadFirst'))
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
						className="h-full grid grid-cols-1 lg:grid-cols-[var(--tte-left)_8px_1fr_8px_var(--tte-right)]"
						style={
							{
								'--tte-left': `${leftColPx}px`,
								'--tte-right': `${rightColPx}px`,
							} as React.CSSProperties
						}
					>
						{/* LEFT PANEL */}
						<div className="order-1 lg:order-none lg:col-start-1 lg:col-end-2 lg:row-start-1 h-full overflow-hidden border-r border-border bg-card">
							<ThreadTemplateVisualEditor
								layout="panels"
								structureClassName="h-full"
								propertiesClassName="hidden" 
								showSceneToggle={false}
								structureCollapsed={layout.leftCollapsed}
								onStructureCollapsedChange={setLeftCollapsed}
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
						</div>

						{/* LEFT RESIZER */}
						<div
							className="hidden lg:flex lg:col-start-2 lg:col-end-3 lg:row-start-1 cursor-col-resize items-center justify-center select-none touch-none hover:bg-accent/50 transition-colors z-10"
							onPointerDown={(e) => startResize('left', e)}
							onDoubleClick={() => {
								setLayout((prev) => ({
									...prev,
									leftPx: 320,
									leftCollapsed: false,
								}))
							}}
						>
							<div className="h-8 w-1 rounded-full bg-border/80" />
						</div>

						{/* CENTER CANVAS */}
						<div className="order-2 lg:order-none lg:col-start-3 lg:col-end-4 lg:row-start-1 h-full overflow-hidden flex flex-col min-h-0 bg-muted/5">
							<ThreadTemplateCanvasToolbar
									t={t}
									editorScene={editorScene}
									onEditorSceneChange={(s) => {
										setEditorScene(s)
										setEditorSelectedKey(`${s}:[]`)
									}}
									previewMode={previewMode}
									onPreviewModeChange={(m) => setPreviewMode(m)}
								zoom={zoom}
								onZoomChange={(next) => setZoom(next)}
								focusMode={layout.leftCollapsed && layout.rightCollapsed}
								onToggleFocusMode={() => {
									const isFocused = layout.leftCollapsed && layout.rightCollapsed
									if (isFocused) {
										setLayout((prev) => ({
											...prev,
											leftCollapsed: false,
											rightCollapsed: false,
										}))
										return
									}
									setLayout((prev) => ({
										...prev,
										leftCollapsed: true,
										rightCollapsed: true,
									}))
								}}
							/>

							<div className="flex-1 min-h-0 relative overflow-hidden">
								{/* Canvas Background Pattern */}
								<div
									className="absolute inset-0 opacity-[0.03] pointer-events-none"
									style={{
										backgroundImage:
											'radial-gradient(circle, currentColor 1px, transparent 1px)',
										backgroundSize: '20px 20px',
									}}
								/>

								<div className="h-full overflow-auto">
									<div className="min-h-full flex items-center justify-center p-8 relative">
											<div
												style={{
													transform: `scale(${zoom})`,
													transition: 'transform 0.1s ease-out',
												}}
												className="origin-center w-full max-w-[560px] flex flex-col items-center justify-center"
											>
												<div className="relative w-full shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] bg-black rounded-sm overflow-hidden ring-1 ring-black/5">
													{previewMode === 'edit' ? (
														<ThreadRemotionEditorSurface
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
														templateConfig={normalizedTemplateConfig as any}
													/>
												)}
											</div>
										</div>
									</div>
								</div>

								{/* Canvas Messages */}
								<div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-80 flex flex-col items-center gap-2 z-10">
									{previewThreadId && previewThreadQuery.isError ? (
										<div className="font-mono text-xs text-destructive bg-destructive/10 backdrop-blur px-2 py-1 rounded shadow-sm border border-destructive/20">
											{t('panels.previewLoadFailed')}
										</div>
									) : null}

									{previewThreadId &&
									!previewRoot &&
									!previewThreadQuery.isLoading ? (
										<div className="font-mono text-xs text-muted-foreground bg-muted/80 backdrop-blur px-2 py-1 rounded shadow-sm border border-border/50">
											{t('panels.previewNoRoot')}
										</div>
									) : null}
								</div>
							</div>
						</div>

						{/* RIGHT RESIZER */}
						<div
							className="hidden lg:flex lg:col-start-4 lg:col-end-5 lg:row-start-1 cursor-col-resize items-center justify-center select-none touch-none hover:bg-accent/50 transition-colors z-10"
							onPointerDown={(e) => startResize('right', e)}
							onDoubleClick={() => {
								setLayout((prev) => ({
									...prev,
									rightPx: 360,
									rightCollapsed: false,
								}))
							}}
						>
							<div className="h-8 w-1 rounded-full bg-border/80" />
						</div>

						{/* RIGHT PANEL */}
						<div className="order-3 lg:order-none lg:col-start-5 lg:col-end-6 lg:row-start-1 h-full overflow-hidden border-l border-border bg-card flex flex-col">
							{showAdvanced ? (
								<div className="flex-1 flex flex-col min-h-0">
									<div className="flex items-center justify-between px-3 py-2 border-b border-border">
										<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">JSON Config</span>
										<Button 
											variant="ghost" 
											size="icon" 
											className="size-6"
											onClick={() => setShowAdvanced(false)}
										>
											<X className="size-3" />
										</Button>
									</div>
									<div className="flex-1 p-2 min-h-0">
										<Textarea
											value={toPrettyJson(visualTemplateConfig)}
											readOnly
											className="h-full w-full resize-none rounded-sm font-mono text-xs bg-muted/30 border-0 focus-visible:ring-0"
										/>
									</div>
								</div>
							) : (
								<ThreadTemplateVisualEditor
									layout="panels"
									structureClassName="hidden"
									propertiesClassName="h-full"
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
							)}
						</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	)
}
