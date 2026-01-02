'use client'

import { buildCommentTimeline, REMOTION_FPS } from '@app/media-comments'
import type { ThumbnailMethods } from '@remotion/player'
import {
	DEFAULT_THREAD_TEMPLATE_ID,
	getThreadTemplate,
	type ThreadTemplateId,
} from '@app/remotion-project/thread-templates'
import type { ThreadVideoInputProps } from '@app/remotion-project/types'
import type { ThreadTemplateConfigV1 } from '@app/remotion-project/types'
import { AlertCircle, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Skeleton } from '~/components/ui/skeleton'
import { ThreadRemotionEditorCard } from '~/components/business/threads/thread-remotion-editor-card'
import { useTranslations } from '~/lib/i18n'

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

type SceneKey = 'cover' | 'post'
type NodePath = Array<string | number>

function numOrNull(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function intOrNull(v: unknown): number | null {
	const n = numOrNull(v)
	if (n == null) return null
	return Math.round(n)
}

function clamp01(input: unknown): number | null {
	const n = numOrNull(input)
	if (n == null) return null
	return Math.max(0, Math.min(1, n))
}

function toNumberInputValue(v: unknown): string {
	const n = numOrNull(v)
	return n == null ? '' : String(n)
}

function computeBoxForElRaw(wrapper: HTMLElement, el: HTMLElement) {
	const wRect = wrapper.getBoundingClientRect()
	const r = el.getBoundingClientRect()
	return {
		x: r.left - wRect.left,
		y: r.top - wRect.top,
		w: r.width,
		h: r.height,
	}
}

function buildTemplateNodeKey(scene: SceneKey, path: NodePath): string {
	return `${scene}:${JSON.stringify(path)}`
}

function parseTemplateNodeKey(
	key: string,
): { scene: SceneKey; path: NodePath } | null {
	const idx = key.indexOf(':')
	if (idx <= 0) return null
	const sceneRaw = key.slice(0, idx)
	if (sceneRaw !== 'cover' && sceneRaw !== 'post') return null
	const json = key.slice(idx + 1)
	try {
		const path = JSON.parse(json) as unknown
		if (!Array.isArray(path)) return null
		return { scene: sceneRaw, path: path as NodePath }
	} catch {
		return null
	}
}

function getNodeAtPath(
	root: any,
	path: NodePath,
): ThreadVideoInputProps['templateConfig'] | null {
	let cur: any = root
	for (let i = 0; i < path.length; i++) {
		const seg = path[i]
		if (seg === 'children') {
			const idx = path[i + 1]
			if (typeof idx !== 'number') return null
			cur = cur?.children?.[idx]
			i++
			continue
		}
		if (typeof seg === 'string') {
			cur = cur?.[seg]
			continue
		}
		return null
	}
	return cur ?? null
}

function updateNodeAtPath(
	root: any,
	path: NodePath,
	updater: (node: any) => any,
): any {
	if (!root) return root
	if (path.length === 0) return updater(root)

	const seg = path[0]
	if (seg === 'children') {
		const idx = path[1]
		if (typeof idx !== 'number') return root
		const children = Array.isArray(root.children) ? root.children.slice() : []
		const child = children[idx]
		if (!child) return root
		children[idx] = updateNodeAtPath(child, path.slice(2), updater)
		return { ...root, children }
	}

	if (typeof seg === 'string') {
		const child = root?.[seg]
		if (!child) return root
		return { ...root, [seg]: updateNodeAtPath(child, path.slice(1), updater) }
	}

	return root
}

function getNodeByKey(
	config: ThreadTemplateConfigV1,
	key: string,
): { scene: SceneKey; path: NodePath; node: any } | null {
	const parsed = parseTemplateNodeKey(key)
	if (!parsed) return null
	const root = (config.scenes?.[parsed.scene]?.root as any) ?? null
	if (!root) return null
	const node = getNodeAtPath(root, parsed.path)
	if (!node) return null
	return { scene: parsed.scene, path: parsed.path, node }
}

function updateNodeByKey(
	config: ThreadTemplateConfigV1,
	key: string,
	updater: (node: any) => any,
): ThreadTemplateConfigV1 {
	const parsed = parseTemplateNodeKey(key)
	if (!parsed) return config
	const root = config.scenes?.[parsed.scene]?.root as any
	if (!root) return config

	const nextRoot = updateNodeAtPath(root, parsed.path, updater)
	return {
		...config,
		scenes: {
			...config.scenes,
			[parsed.scene]: {
				...config.scenes?.[parsed.scene],
				root: nextRoot,
			},
		},
	}
}

function setAbsolutePositionByKey(
	config: ThreadTemplateConfigV1,
	key: string,
	nextPos: { x: number; y: number },
): ThreadTemplateConfigV1 {
	return updateNodeByKey(config, key, (n) => {
		if (!n || n.type !== 'Absolute') return n
		return { ...n, x: nextPos.x, y: nextPos.y }
	})
}

function setAbsoluteRectByKey(
	config: ThreadTemplateConfigV1,
	key: string,
	nextRect: { x: number; y: number; width: number; height: number },
): ThreadTemplateConfigV1 {
	return updateNodeByKey(config, key, (n) => {
		if (!n || n.type !== 'Absolute') return n
		return {
			...n,
			x: nextRect.x,
			y: nextRect.y,
			width: nextRect.width,
			height: nextRect.height,
		}
	})
}

function ensureAbsoluteSizeByKey(
	config: ThreadTemplateConfigV1,
	key: string,
	nextSize: { width: number; height: number },
): ThreadTemplateConfigV1 {
	return updateNodeByKey(config, key, (n) => {
		if (!n || n.type !== 'Absolute') return n
		const width = intOrNull(n.width)
		const height = intOrNull(n.height)
		if (width != null && height != null) return n
		return {
			...n,
			width: width ?? Math.max(1, Math.round(nextSize.width)),
			height: height ?? Math.max(1, Math.round(nextSize.height)),
		}
	})
}

export function ThreadRemotionEditorSurface({
	thread,
	root,
	replies,
	isLoading,
	assets = [],
	audio = null,
	templateId,
	templateConfig,
	editCanvasConfig = null,
	onEditCanvasConfigChange,
	onEditCanvasTransaction,
	canEditUndo,
	canEditRedo,
	onEditUndo,
	onEditRedo,
	showLayers = true,
	showInspector = true,
	scene,
	externalPrimaryKey,
	onSelectionChange,
}: {
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
	editCanvasConfig?: ThreadTemplateConfigV1 | null
	onEditCanvasConfigChange?: (next: ThreadTemplateConfigV1) => void
	onEditCanvasTransaction?: (phase: 'start' | 'end') => void
	canEditUndo?: boolean
	canEditRedo?: boolean
	onEditUndo?: () => void
	onEditRedo?: () => void
	showLayers?: boolean
	showInspector?: boolean
	scene?: SceneKey
	externalPrimaryKey?: string | null
	onSelectionChange?: (next: {
		keys: string[]
		primaryKey: string | null
		primaryType: string | null
	}) => void
}) {
	const isClient = typeof window !== 'undefined'
	const t = useTranslations('Threads.remotionEditor')
	const ui = 'canvas' as const

	const mode = 'edit' as const
	const [editFrame, setEditFrame] = React.useState(0)

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

	React.useEffect(() => {
		setEditFrame((prev) => {
			const max = Math.max(0, timeline.totalDurationInFrames - 1)
			return Math.min(Math.max(0, prev), max)
		})
	}, [timeline.totalDurationInFrames])

	const editScene: SceneKey =
		editFrame < timeline.coverDurationInFrames ? 'cover' : 'post'

	React.useEffect(() => {
		if (!scene) return
		const max = Math.max(0, timeline.totalDurationInFrames - 1)
		const nextFrame =
			scene === 'cover' ? 0 : Math.max(0, timeline.coverDurationInFrames)
		setEditFrame((prev) => {
			const clamped = Math.min(nextFrame, max)
			return prev === clamped ? prev : clamped
		})
	}, [
		scene,
		timeline.coverDurationInFrames,
		timeline.totalDurationInFrames,
	])

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

	const thumbnailRef = React.useRef<ThumbnailMethods | null>(null)
	const previewWrapperRef = React.useRef<HTMLDivElement | null>(null)

	type Box = { x: number; y: number; w: number; h: number }
	type SnapGuide = { pos: number; label: string }
	type SnapTarget = {
		pos: number
		key: string
		type: string | null
		line: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'middle'
	}

	const [selectedKeys, setSelectedKeys] = React.useState<string[]>([])
	const [primaryKey, setPrimaryKey] = React.useState<string | null>(null)
	const [primaryType, setPrimaryType] = React.useState<string | null>(null)
	const primaryElementRef = React.useRef<HTMLElement | null>(null)
	const [selectedBoxesByKey, setSelectedBoxesByKey] = React.useState<
		Map<string, Box>
	>(() => new Map())
	const [primaryBox, setPrimaryBox] = React.useState<Box | null>(null)
	const [hoverNodeKey, setHoverNodeKey] = React.useState<string | null>(null)
	const [hoverNodeType, setHoverNodeType] = React.useState<string | null>(null)
	const hoverElementRef = React.useRef<HTMLElement | null>(null)
	const pickCycleRef = React.useRef<{
		x: number
		y: number
		t: number
		keys: string[]
	} | null>(null)
	const [hoverBox, setHoverBox] = React.useState<{
		x: number
		y: number
		w: number
		h: number
	} | null>(null)
	const [isDragging, setIsDragging] = React.useState(false)
	const [snapEnabled, setSnapEnabled] = React.useState(true)
	const [snapGuides, setSnapGuides] = React.useState<{
		v: SnapGuide[]
		h: SnapGuide[]
	} | null>(null)
	const [canvasScale, setCanvasScale] = React.useState(1)
	const [viewTool, setViewTool] = React.useState<'select' | 'pan'>('select')
	const [viewScale, setViewScale] = React.useState(1)
	const viewScaleRef = React.useRef(1)
	React.useEffect(() => {
		viewScaleRef.current = viewScale
	}, [viewScale])
	const [viewPan, setViewPan] = React.useState<{ x: number; y: number }>({
		x: 0,
		y: 0,
	})
	const viewPanRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 })
	React.useEffect(() => {
		viewPanRef.current = viewPan
	}, [viewPan])
	const panRef = React.useRef<
		| {
				active: boolean
				startClientX: number
				startClientY: number
				startPanX: number
				startPanY: number
				pointerId: number
		  }
		| undefined
	>()
	const [isPanning, setIsPanning] = React.useState(false)

	const [layersFilter, setLayersFilter] = React.useState('')
	const [hiddenLayerKeys, setHiddenLayerKeys] = React.useState<string[]>([])
	const [lockedLayerKeys, setLockedLayerKeys] = React.useState<string[]>([])
	const hiddenKeySet = React.useMemo(
		() => new Set(hiddenLayerKeys),
		[hiddenLayerKeys],
	)
	const lockedKeySet = React.useMemo(
		() => new Set(lockedLayerKeys),
		[lockedLayerKeys],
	)
	const [collapsedLayerKeys, setCollapsedLayerKeys] = React.useState<string[]>(
		[],
	)
	const collapsedKeySet = React.useMemo(
		() => new Set(collapsedLayerKeys),
		[collapsedLayerKeys],
	)

	type LayerNode = {
		key: string
		type: string | null
		scene: SceneKey
		path: NodePath
		parentKey: string | null
		depth: number
		children: string[]
	}

	const [layerNodesByKey, setLayerNodesByKey] = React.useState<
		Map<string, LayerNode>
	>(() => new Map())
	const [layerRootsByScene, setLayerRootsByScene] = React.useState<{
		cover: string[]
		post: string[]
	}>({ cover: [], post: [] })

	React.useEffect(() => {
		if (selectedKeys.length === 0) return
		if (!selectedKeys.some((k) => hiddenKeySet.has(k))) return
		const next = selectedKeys.filter((k) => !hiddenKeySet.has(k))
		setSelectedKeys(next)
		if (primaryKey && hiddenKeySet.has(primaryKey)) {
			setPrimaryKey(next[next.length - 1] ?? null)
		}
	}, [hiddenKeySet, primaryKey, selectedKeys])

	const [marquee, setMarquee] = React.useState<{
		active: boolean
		startX: number
		startY: number
		x: number
		y: number
		w: number
		h: number
		additive: boolean
		baseSelectedKeys: string[]
		pointerId: number
	} | null>(null)

	const dragRef = React.useRef<
		| {
				kind: 'move'
				primaryKey: string
				keys: string[]
				startRectsByKey: Record<
					string,
					{ x: number; y: number; w: number; h: number }
				>
				groupStart: { x: number; y: number; w: number; h: number }
				targetsV: SnapTarget[]
				targetsH: SnapTarget[]
				axisLock: 'x' | 'y' | null
				startClientX: number
				startClientY: number
				scale: number
				pointerId: number
		  }
		| {
				kind: 'resize'
				key: string
				targetsV: SnapTarget[]
				targetsH: SnapTarget[]
				handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
				startClientX: number
				startClientY: number
				startX: number
				startY: number
				startW: number
				startH: number
				scale: number
				pointerId: number
		  }
	>()

	const canEditCanvas = Boolean(editCanvasConfig && onEditCanvasConfigChange)
	const editCanvasConfigRef = React.useRef<ThreadTemplateConfigV1 | null>(null)
	React.useEffect(() => {
		editCanvasConfigRef.current = editCanvasConfig
	}, [editCanvasConfig])

	const selectionStateRef = React.useRef<{
		selectedKeys: string[]
		primaryKey: string | null
		primaryType: string | null
	}>({ selectedKeys: [], primaryKey: null, primaryType: null })
	React.useEffect(() => {
		selectionStateRef.current = { selectedKeys, primaryKey, primaryType }
	}, [primaryKey, primaryType, selectedKeys])

	const isSyncingExternalSelectionRef = React.useRef(false)
	React.useEffect(() => {
		if (externalPrimaryKey === undefined) return

		const { selectedKeys: curKeys, primaryKey: curPrimaryKey } =
			selectionStateRef.current

		if (!externalPrimaryKey) {
			if (curKeys.length === 0 && curPrimaryKey == null) return
			isSyncingExternalSelectionRef.current = true
			setSelectedKeys([])
			setPrimaryKey(null)
			setPrimaryType(null)
			return
		}

		if (
			curPrimaryKey === externalPrimaryKey &&
			curKeys.length === 1 &&
			curKeys[0] === externalPrimaryKey
		)
			return

		isSyncingExternalSelectionRef.current = true
		setSelectedKeys([externalPrimaryKey])
		setPrimaryKey(externalPrimaryKey)

		const cfg = editCanvasConfigRef.current
		const res = cfg ? getNodeByKey(cfg, externalPrimaryKey) : null
		setPrimaryType((res?.node as any)?.type ?? null)

		const parsed = parseTemplateNodeKey(externalPrimaryKey)
		if (!parsed) return
		setEditFrame((prev) => {
			const nextFrame =
				parsed.scene === 'cover'
					? 0
					: Math.max(0, timeline.coverDurationInFrames)
			if (nextFrame === prev) return prev
			const max = Math.max(0, timeline.totalDurationInFrames - 1)
			return Math.min(nextFrame, max)
		})
	}, [externalPrimaryKey, timeline.coverDurationInFrames, timeline.totalDurationInFrames])

	const onSelectionChangeRef = React.useRef(onSelectionChange)
	React.useEffect(() => {
		onSelectionChangeRef.current = onSelectionChange
	}, [onSelectionChange])

	const lastSelectionSnapshotRef = React.useRef<{
		keys: string[]
		primaryKey: string | null
		primaryType: string | null
	} | null>(null)

	React.useEffect(() => {
		const cb = onSelectionChangeRef.current
		if (!cb) return

		const next = { keys: selectedKeys, primaryKey, primaryType }
		if (isSyncingExternalSelectionRef.current) {
			isSyncingExternalSelectionRef.current = false
			lastSelectionSnapshotRef.current = next
			return
		}

		const prev = lastSelectionSnapshotRef.current
		if (
			prev &&
			prev.primaryKey === next.primaryKey &&
			prev.primaryType === next.primaryType &&
			prev.keys.length === next.keys.length &&
			prev.keys.every((k, i) => k === next.keys[i])
		)
			return
		lastSelectionSnapshotRef.current = next
		cb(next)
	}, [primaryKey, primaryType, selectedKeys])

	React.useEffect(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper) return

		// Always clear editor-only attrs when not in Edit mode
		if (mode !== 'edit') {
			const elements = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
			for (const el of elements) {
				el.removeAttribute('data-tt-editor-hidden')
				el.style.removeProperty('pointer-events')
			}
			return
		}

		const id = requestAnimationFrame(() => {
			const elements = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
			const nodes = new Map<string, LayerNode>()

			const pathDepth = (path: NodePath) => {
				let d = 0
				for (const seg of path) {
					if (seg === 'children') d++
					else if (typeof seg === 'string') d++
				}
				return d
			}

			const parentPathOf = (path: NodePath): NodePath | null => {
				if (path.length === 0) return null
				if (
					typeof path[path.length - 1] === 'number' &&
					path[path.length - 2] === 'children'
				)
					return path.slice(0, -2)
				return path.slice(0, -1)
			}

			const ensure = (
				key: string,
				parsed: { scene: SceneKey; path: NodePath },
				type: string | null,
			) => {
				const parentPath = parentPathOf(parsed.path)
				const parentKey = parentPath
					? buildTemplateNodeKey(parsed.scene, parentPath)
					: null

				if (!nodes.has(key)) {
					nodes.set(key, {
						key,
						type,
						scene: parsed.scene,
						path: parsed.path,
						parentKey,
						depth: pathDepth(parsed.path),
						children: [],
					})
				}

				let curPath = parentPath
				while (curPath) {
					const curKey = buildTemplateNodeKey(parsed.scene, curPath)
					const curParentPath = parentPathOf(curPath)
					const curParentKey = curParentPath
						? buildTemplateNodeKey(parsed.scene, curParentPath)
						: null
					if (!nodes.has(curKey)) {
						nodes.set(curKey, {
							key: curKey,
							type: null,
							scene: parsed.scene,
							path: curPath,
							parentKey: curParentKey,
							depth: pathDepth(curPath),
							children: [],
						})
					}
					curPath = curParentPath
				}
			}

			for (const el of elements) {
				const key = el.getAttribute('data-tt-key')
				if (!key) continue
				const parsed = parseTemplateNodeKey(key)
				if (!parsed) continue
				const type = el.getAttribute('data-tt-type')
				ensure(key, parsed, type)
			}

			// Ensure scene roots exist even if not present in DOM snapshot
			for (const scene of ['cover', 'post'] as const) {
				const rootKey = buildTemplateNodeKey(scene, [])
				if (!nodes.has(rootKey)) {
					nodes.set(rootKey, {
						key: rootKey,
						type: 'Root',
						scene,
						path: [],
						parentKey: null,
						depth: 0,
						children: [],
					})
				}
			}

			for (const n of nodes.values()) {
				if (!n.parentKey) continue
				const parent = nodes.get(n.parentKey)
				if (!parent) continue
				parent.children.push(n.key)
			}

			const sortByPath = (a: string, b: string) => {
				const na = nodes.get(a)
				const nb = nodes.get(b)
				if (!na || !nb) return a.localeCompare(b)
				return JSON.stringify(na.path).localeCompare(JSON.stringify(nb.path))
			}
			for (const n of nodes.values()) n.children.sort(sortByPath)

			const sceneRoots = { cover: [] as string[], post: [] as string[] }
			for (const n of nodes.values()) {
				if (n.parentKey) continue
				if (n.scene === 'cover') sceneRoots.cover.push(n.key)
				else sceneRoots.post.push(n.key)
			}
			sceneRoots.cover.sort(sortByPath)
			sceneRoots.post.sort(sortByPath)

			setLayerNodesByKey(nodes)
			setLayerRootsByScene(sceneRoots)
		})

		return () => cancelAnimationFrame(id)
	}, [editFrame, mode, templateConfig, templateId])

	React.useEffect(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper) return
		if (mode !== 'edit') return

		const id = requestAnimationFrame(() => {
			const elements = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
			for (const el of elements) {
				el.removeAttribute('data-tt-editor-hidden')
				el.style.removeProperty('pointer-events')
			}
			for (const el of elements) {
				const key = el.getAttribute('data-tt-key')
				if (!key) continue
				if (!hiddenKeySet.has(key)) continue
				el.setAttribute('data-tt-editor-hidden', '1')
				el.style.setProperty('pointer-events', 'none')
			}
		})

		return () => cancelAnimationFrame(id)
	}, [editFrame, hiddenKeySet, mode, templateConfig, templateId])

	const getSubtreeKeys = React.useCallback(
		(key: string) => {
			const out: string[] = []
			const visit = (k: string) => {
				out.push(k)
				const n = layerNodesByKey.get(k)
				if (!n) return
				for (const c of n.children) visit(c)
			}
			visit(key)
			return out
		},
		[layerNodesByKey],
	)

	const toggleCollapsed = React.useCallback((key: string) => {
		setCollapsedLayerKeys((prev) => {
			if (prev.includes(key)) return prev.filter((k) => k !== key)
			return [...prev, key]
		})
	}, [])

	const toggleHiddenSubtree = React.useCallback(
		(key: string) => {
			const subtree = getSubtreeKeys(key)
			setHiddenLayerKeys((prev) => {
				const set = new Set(prev)
				const anyVisible = subtree.some((k) => !set.has(k))
				for (const k of subtree) {
					if (anyVisible) set.add(k)
					else set.delete(k)
				}
				return Array.from(set)
			})
		},
		[getSubtreeKeys],
	)

	const toggleLockedSubtree = React.useCallback(
		(key: string) => {
			const subtree = getSubtreeKeys(key)
			setLockedLayerKeys((prev) => {
				const set = new Set(prev)
				const anyUnlocked = subtree.some((k) => !set.has(k))
				for (const k of subtree) {
					if (anyUnlocked) set.add(k)
					else set.delete(k)
				}
				return Array.from(set)
			})
		},
		[getSubtreeKeys],
	)

	const layerVisibleKeySet = React.useMemo(() => {
		const q = layersFilter.trim().toLowerCase()
		if (!q) return null
		const keep = new Set<string>()
		const matches = new Set<string>()
		for (const n of layerNodesByKey.values()) {
			const hay = `${n.type ?? ''} ${n.key}`.toLowerCase()
			if (hay.includes(q)) matches.add(n.key)
		}
		const addAncestors = (k: string) => {
			let cur: string | null = k
			while (cur) {
				if (keep.has(cur)) break
				keep.add(cur)
				cur = layerNodesByKey.get(cur)?.parentKey ?? null
			}
		}
		for (const k of matches) addAncestors(k)
		return keep
	}, [layerNodesByKey, layersFilter])

	const selectFromLayers = React.useCallback(
		(key: string, type: string | null, e: React.MouseEvent) => {
			const additive = e.shiftKey
			let nextKeys: string[] = []
			if (additive) {
				const cur = selectedKeys.slice()
				const idx = cur.indexOf(key)
				if (idx >= 0) cur.splice(idx, 1)
				else cur.push(key)
				nextKeys = cur
			} else {
				nextKeys = [key]
			}

			if (nextKeys.length === 0) {
				setSelectedKeys([])
				setPrimaryKey(null)
				setPrimaryType(null)
				primaryElementRef.current = null
				setPrimaryBox(null)
				setSelectedBoxesByKey(new Map())
				return
			}

			setSelectedKeys(nextKeys)
			setPrimaryKey(key)
			setPrimaryType(type)

			const wrapper = previewWrapperRef.current
			if (!wrapper) return
			const candidates = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
			let el: HTMLElement | null = null
			for (const c of candidates) {
				if (c.getAttribute('data-tt-key') === key) {
					el = c
					break
				}
			}
			primaryElementRef.current = el
			setPrimaryBox(el ? computeBoxForElRaw(wrapper, el) : null)
		},
		[computeBoxForElRaw, selectedKeys],
	)

	const selectedAbsoluteKeys = React.useMemo(() => {
		if (!editCanvasConfig) return []
		const abs: string[] = []
		for (const k of selectedKeys) {
			if (hiddenKeySet.has(k) || lockedKeySet.has(k)) continue
			const res = getNodeByKey(editCanvasConfig, k)
			if (res?.node?.type === 'Absolute') abs.push(k)
		}
		return abs
	}, [editCanvasConfig, hiddenKeySet, lockedKeySet, selectedKeys])

	const groupBox = React.useMemo(() => {
		if (selectedKeys.length < 2) return null
		let minX = Number.POSITIVE_INFINITY
		let minY = Number.POSITIVE_INFINITY
		let maxX = Number.NEGATIVE_INFINITY
		let maxY = Number.NEGATIVE_INFINITY
		let any = false
		for (const k of selectedKeys) {
			const b = selectedBoxesByKey.get(k)
			if (!b) continue
			any = true
			minX = Math.min(minX, b.x)
			minY = Math.min(minY, b.y)
			maxX = Math.max(maxX, b.x + b.w)
			maxY = Math.max(maxY, b.y + b.h)
		}
		if (!any) return null
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
	}, [selectedBoxesByKey, selectedKeys])

	const getCanvasScale = React.useCallback(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper) return thumbnailRef.current?.getScale?.() ?? 1
		const w = wrapper.getBoundingClientRect().width
		if (!w) return thumbnailRef.current?.getScale?.() ?? 1
		return (w / template.compositionWidth) * viewScale
	}, [template.compositionWidth, viewScale])

	const setViewScaleWithAnchor = React.useCallback(
		(nextScale: number, anchorClient?: { x: number; y: number }) => {
			const wrapper = previewWrapperRef.current
			if (!wrapper) {
				setViewScale(nextScale)
				return
			}
			const clamped = Math.max(0.25, Math.min(4, nextScale))
			const rect = wrapper.getBoundingClientRect()
			const ax = anchorClient ? anchorClient.x - rect.left : rect.width / 2
			const ay = anchorClient ? anchorClient.y - rect.top : rect.height / 2

			const prevScale = viewScaleRef.current
			const prevPan = viewPanRef.current
			if (!Number.isFinite(prevScale) || prevScale <= 0) {
				setViewScale(clamped)
				return
			}

			const contentX = (ax - prevPan.x) / prevScale
			const contentY = (ay - prevPan.y) / prevScale
			const nextPanX = ax - contentX * clamped
			const nextPanY = ay - contentY * clamped

			setViewScale(clamped)
			setViewPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) })
		},
		[],
	)

	const resetView = React.useCallback(() => {
		setViewScale(1)
		setViewPan({ x: 0, y: 0 })
	}, [])

	const fitSelection = React.useCallback(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper) return
		const box = groupBox ?? primaryBox
		if (!box) return

		const rect = wrapper.getBoundingClientRect()
		const pad = 24
		const prevScale = viewScaleRef.current
		const prevPan = viewPanRef.current
		if (!Number.isFinite(prevScale) || prevScale <= 0) return

		const contentX = (box.x - prevPan.x) / prevScale
		const contentY = (box.y - prevPan.y) / prevScale
		const contentW = Math.max(1, box.w / prevScale)
		const contentH = Math.max(1, box.h / prevScale)

		const availW = Math.max(1, rect.width - pad * 2)
		const availH = Math.max(1, rect.height - pad * 2)
		const nextScaleRaw = Math.min(availW / contentW, availH / contentH)
		const nextScale = Math.max(0.25, Math.min(4, nextScaleRaw))

		const targetX = (rect.width - contentW * nextScale) / 2
		const targetY = (rect.height - contentH * nextScale) / 2
		const nextPanX = targetX - contentX * nextScale
		const nextPanY = targetY - contentY * nextScale

		setViewScale(nextScale)
		setViewPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) })
	}, [groupBox, primaryBox])

	const applySnapMove = React.useCallback(
		(input: {
			x: number
			y: number
			w: number
			h: number
			canvasW: number
			canvasH: number
			targetsV: SnapTarget[]
			targetsH: SnapTarget[]
			enabled: boolean
		}) => {
			if (!input.enabled)
				return { x: input.x, y: input.y, guides: { v: [], h: [] } }

			const threshold = 6
			const canvasTargetsV: SnapTarget[] = [
				{ pos: 0, key: 'canvas', type: 'Canvas', line: 'left' },
				{
					pos: input.canvasW / 2,
					key: 'canvas',
					type: 'Canvas',
					line: 'center',
				},
				{ pos: input.canvasW, key: 'canvas', type: 'Canvas', line: 'right' },
			]
			const canvasTargetsH: SnapTarget[] = [
				{ pos: 0, key: 'canvas', type: 'Canvas', line: 'top' },
				{
					pos: input.canvasH / 2,
					key: 'canvas',
					type: 'Canvas',
					line: 'middle',
				},
				{ pos: input.canvasH, key: 'canvas', type: 'Canvas', line: 'bottom' },
			]

			const describeTarget = (t: SnapTarget) => {
				if (t.key === 'canvas') return `canvas:${t.line}`
				const shortKey =
					t.key.length > 26
						? `${t.key.slice(0, 10)}…${t.key.slice(-12)}`
						: t.key
				return `${t.type ?? 'node'}:${t.line} ${shortKey}`
			}

			const candidatesV: Array<{
				target: SnapTarget
				delta: number
				edge: 'L' | 'R' | 'C'
			}> = []
			for (const target of [...canvasTargetsV, ...input.targetsV]) {
				const line = target.pos
				candidatesV.push({ target, delta: line - input.x, edge: 'L' }) // left
				candidatesV.push({
					target,
					delta: line - (input.x + input.w),
					edge: 'R',
				}) // right
				candidatesV.push({
					target,
					delta: line - (input.x + input.w / 2),
					edge: 'C',
				}) // center
			}
			const candidatesH: Array<{
				target: SnapTarget
				delta: number
				edge: 'T' | 'B' | 'M'
			}> = []
			for (const target of [...canvasTargetsH, ...input.targetsH]) {
				const line = target.pos
				candidatesH.push({ target, delta: line - input.y, edge: 'T' }) // top
				candidatesH.push({
					target,
					delta: line - (input.y + input.h),
					edge: 'B',
				}) // bottom
				candidatesH.push({
					target,
					delta: line - (input.y + input.h / 2),
					edge: 'M',
				}) // middle
			}

			const bestV = candidatesV
				.filter((c) => Math.abs(c.delta) <= threshold)
				.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
			const bestH = candidatesH
				.filter((c) => Math.abs(c.delta) <= threshold)
				.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]

			const guides = { v: [] as SnapGuide[], h: [] as SnapGuide[] }
			const x = input.x + (bestV ? bestV.delta : 0)
			const y = input.y + (bestH ? bestH.delta : 0)
			if (bestV)
				guides.v.push({
					pos: bestV.target.pos,
					label: `${bestV.edge}=${describeTarget(bestV.target)}`,
				})
			if (bestH)
				guides.h.push({
					pos: bestH.target.pos,
					label: `${bestH.edge}=${describeTarget(bestH.target)}`,
				})
			return { x, y, guides }
		},
		[],
	)

	const applySnapResize = React.useCallback(
		(input: {
			x: number
			y: number
			w: number
			h: number
			canvasW: number
			canvasH: number
			targetsV: SnapTarget[]
			targetsH: SnapTarget[]
			handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
			enabled: boolean
		}) => {
			if (!input.enabled)
				return {
					x: input.x,
					y: input.y,
					w: input.w,
					h: input.h,
					guides: { v: [], h: [] },
				}

			const threshold = 6
			let x = input.x
			let y = input.y
			let w = input.w
			let h = input.h
			const guides = { v: [] as SnapGuide[], h: [] as SnapGuide[] }

			const canvasTargetsV: SnapTarget[] = [
				{ pos: 0, key: 'canvas', type: 'Canvas', line: 'left' },
				{
					pos: input.canvasW / 2,
					key: 'canvas',
					type: 'Canvas',
					line: 'center',
				},
				{ pos: input.canvasW, key: 'canvas', type: 'Canvas', line: 'right' },
			]
			const canvasTargetsH: SnapTarget[] = [
				{ pos: 0, key: 'canvas', type: 'Canvas', line: 'top' },
				{
					pos: input.canvasH / 2,
					key: 'canvas',
					type: 'Canvas',
					line: 'middle',
				},
				{ pos: input.canvasH, key: 'canvas', type: 'Canvas', line: 'bottom' },
			]

			const describeTarget = (t: SnapTarget) => {
				if (t.key === 'canvas') return `canvas:${t.line}`
				const shortKey =
					t.key.length > 26
						? `${t.key.slice(0, 10)}…${t.key.slice(-12)}`
						: t.key
				return `${t.type ?? 'node'}:${t.line} ${shortKey}`
			}

			const targetsV = [...canvasTargetsV, ...input.targetsV]
			const targetsH = [...canvasTargetsH, ...input.targetsH]

			const snapEdgeX = (edge: 'left' | 'right') => {
				const pos = edge === 'left' ? x : x + w
				const best = targetsV
					.map((t) => ({ t, delta: t.pos - pos }))
					.filter((c) => Math.abs(c.delta) <= threshold)
					.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
				if (!best) return
				if (edge === 'right') {
					w = Math.max(1, w + best.delta)
				} else {
					x = x + best.delta
					w = Math.max(1, w - best.delta)
				}
				guides.v.push({
					pos: best.t.pos,
					label: `${edge === 'left' ? 'L' : 'R'}=${describeTarget(best.t)}`,
				})
			}

			const snapEdgeY = (edge: 'top' | 'bottom') => {
				const pos = edge === 'top' ? y : y + h
				const best = targetsH
					.map((t) => ({ t, delta: t.pos - pos }))
					.filter((c) => Math.abs(c.delta) <= threshold)
					.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
				if (!best) return
				if (edge === 'bottom') {
					h = Math.max(1, h + best.delta)
				} else {
					y = y + best.delta
					h = Math.max(1, h - best.delta)
				}
				guides.h.push({
					pos: best.t.pos,
					label: `${edge === 'top' ? 'T' : 'B'}=${describeTarget(best.t)}`,
				})
			}

			if (input.handle.includes('e')) snapEdgeX('right')
			if (input.handle.includes('w')) snapEdgeX('left')
			if (input.handle.includes('s')) snapEdgeY('bottom')
			if (input.handle.includes('n')) snapEdgeY('top')

			return { x, y, w, h, guides }
		},
		[],
	)

	const buildSnapTargets = React.useCallback(
		(excludeKeys: Set<string>) => {
			const wrapper = previewWrapperRef.current
			const scale = getCanvasScale()
			if (!wrapper || !Number.isFinite(scale) || scale <= 0)
				return { v: [] as SnapTarget[], h: [] as SnapTarget[] }

			const wrapperRect = wrapper.getBoundingClientRect()
			const pan = viewPanRef.current
			const v: SnapTarget[] = []
			const h: SnapTarget[] = []

			const nodes = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
			for (const el of nodes) {
				const key = el.getAttribute('data-tt-key')
				if (!key) continue
				if (excludeKeys.has(key)) continue
				if (hiddenKeySet.has(key) || lockedKeySet.has(key)) continue
				const type = el.getAttribute('data-tt-type')
				const r = el.getBoundingClientRect()
				if (r.width < 2 || r.height < 2) continue
				const areaRatio =
					(r.width * r.height) / (wrapperRect.width * wrapperRect.height)
				if (areaRatio > 0.92) continue
				const x = (r.left - wrapperRect.left - pan.x) / scale
				const y = (r.top - wrapperRect.top - pan.y) / scale
				const w = r.width / scale
				const hh = r.height / scale
				const left = Math.round(x)
				const right = Math.round(x + w)
				const cx = Math.round(x + w / 2)
				const top = Math.round(y)
				const bottom = Math.round(y + hh)
				const cy = Math.round(y + hh / 2)
				v.push({ pos: left, key, type, line: 'left' })
				v.push({ pos: right, key, type, line: 'right' })
				v.push({ pos: cx, key, type, line: 'center' })
				h.push({ pos: top, key, type, line: 'top' })
				h.push({ pos: bottom, key, type, line: 'bottom' })
				h.push({ pos: cy, key, type, line: 'middle' })
			}

			return { v, h }
		},
		[getCanvasScale, hiddenKeySet, lockedKeySet],
	)

	const computeAbsoluteRectsForKeys = React.useCallback(
		(cfg: ThreadTemplateConfigV1, keys: string[]) => {
			const scale = getCanvasScale()
			const safeScale = scale > 0 ? scale : 1
			const wrapper = previewWrapperRef.current
			const candidates =
				wrapper?.querySelectorAll<HTMLElement>('[data-tt-key]') ?? null
			const findEl = (k: string) => {
				if (!candidates) return null
				for (const c of candidates) {
					if (c.getAttribute('data-tt-key') === k) return c
				}
				return null
			}

			const rects: Array<{
				key: string
				x: number
				y: number
				w: number
				h: number
			}> = []
			const ensureSizes: Array<{ key: string; width: number; height: number }> =
				[]

			for (const key of keys) {
				const res = getNodeByKey(cfg, key)
				if (!res?.node || res.node.type !== 'Absolute') continue
				const node = res.node as any

				const x = intOrNull(node.x) ?? 0
				const y = intOrNull(node.y) ?? 0

				let w = intOrNull(node.width)
				let h = intOrNull(node.height)
				if (w == null || h == null) {
					const el = findEl(key)
					const dw = el
						? Math.max(
								1,
								Math.round(el.getBoundingClientRect().width / safeScale),
							)
						: 240
					const dh = el
						? Math.max(
								1,
								Math.round(el.getBoundingClientRect().height / safeScale),
							)
						: 120
					w = w ?? dw
					h = h ?? dh
					ensureSizes.push({ key, width: w, height: h })
				}

				rects.push({ key, x, y, w: Math.max(1, w), h: Math.max(1, h) })
			}

			return { rects, ensureSizes }
		},
		[getCanvasScale],
	)

	const runEditCanvasCommand = React.useCallback(
		(fn: (cfg: ThreadTemplateConfigV1) => ThreadTemplateConfigV1) => {
			if (!canEditCanvas) return
			if (!onEditCanvasConfigChange) return
			const cfg = editCanvasConfigRef.current
			if (!cfg) return
			onEditCanvasTransaction?.('start')
			try {
				onEditCanvasConfigChange(fn(cfg))
			} finally {
				onEditCanvasTransaction?.('end')
			}
		},
		[canEditCanvas, onEditCanvasConfigChange, onEditCanvasTransaction],
	)

	const alignSelection = React.useCallback(
		(kind: 'left' | 'hCenter' | 'right' | 'top' | 'vCenter' | 'bottom') => {
			runEditCanvasCommand((cfg) => {
				const effectiveKeys = selectedKeys.filter(
					(k) => !hiddenKeySet.has(k) && !lockedKeySet.has(k),
				)
				const { rects, ensureSizes } = computeAbsoluteRectsForKeys(
					cfg,
					effectiveKeys,
				)
				if (rects.length < 2) return cfg

				let nextCfg = cfg
				for (const s of ensureSizes)
					nextCfg = ensureAbsoluteSizeByKey(nextCfg, s.key, s)

				const left = Math.min(...rects.map((r) => r.x))
				const right = Math.max(...rects.map((r) => r.x + r.w))
				const top = Math.min(...rects.map((r) => r.y))
				const bottom = Math.max(...rects.map((r) => r.y + r.h))
				const cx = (left + right) / 2
				const cy = (top + bottom) / 2

				for (const r of rects) {
					let x = r.x
					let y = r.y
					if (kind === 'left') x = left
					if (kind === 'right') x = right - r.w
					if (kind === 'hCenter') x = cx - r.w / 2
					if (kind === 'top') y = top
					if (kind === 'bottom') y = bottom - r.h
					if (kind === 'vCenter') y = cy - r.h / 2
					nextCfg = setAbsolutePositionByKey(nextCfg, r.key, {
						x: Math.round(x),
						y: Math.round(y),
					})
				}

				return nextCfg
			})
		},
		[
			computeAbsoluteRectsForKeys,
			hiddenKeySet,
			lockedKeySet,
			runEditCanvasCommand,
			selectedKeys,
		],
	)

	const distributeSelection = React.useCallback(
		(kind: 'horizontal' | 'vertical') => {
			runEditCanvasCommand((cfg) => {
				const effectiveKeys = selectedKeys.filter(
					(k) => !hiddenKeySet.has(k) && !lockedKeySet.has(k),
				)
				const { rects, ensureSizes } = computeAbsoluteRectsForKeys(
					cfg,
					effectiveKeys,
				)
				if (rects.length < 3) return cfg

				let nextCfg = cfg
				for (const s of ensureSizes)
					nextCfg = ensureAbsoluteSizeByKey(nextCfg, s.key, s)

				if (kind === 'horizontal') {
					const sorted = rects.slice().sort((a, b) => a.x - b.x)
					const left = sorted[0]!.x
					const right = Math.max(...sorted.map((r) => r.x + r.w))
					const totalW = sorted.reduce((acc, r) => acc + r.w, 0)
					const gap = (right - left - totalW) / (sorted.length - 1)
					let cursor = left
					for (const r of sorted) {
						nextCfg = setAbsolutePositionByKey(nextCfg, r.key, {
							x: Math.round(cursor),
							y: Math.round(r.y),
						})
						cursor += r.w + gap
					}
					return nextCfg
				}

				const sorted = rects.slice().sort((a, b) => a.y - b.y)
				const top = sorted[0]!.y
				const bottom = Math.max(...sorted.map((r) => r.y + r.h))
				const totalH = sorted.reduce((acc, r) => acc + r.h, 0)
				const gap = (bottom - top - totalH) / (sorted.length - 1)
				let cursor = top
				for (const r of sorted) {
					nextCfg = setAbsolutePositionByKey(nextCfg, r.key, {
						x: Math.round(r.x),
						y: Math.round(cursor),
					})
					cursor += r.h + gap
				}
				return nextCfg
			})
		},
		[
			computeAbsoluteRectsForKeys,
			hiddenKeySet,
			lockedKeySet,
			runEditCanvasCommand,
			selectedKeys,
		],
	)

	const beginResize = React.useCallback(
		(
			handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
			e: React.PointerEvent<HTMLDivElement>,
		) => {
			if (mode !== 'edit') return
			if (!canEditCanvas) return
			if (!onEditCanvasConfigChange) return
			if (!primaryKey || primaryType !== 'Absolute') return
			if (hiddenKeySet.has(primaryKey) || lockedKeySet.has(primaryKey)) return

			const cfg = editCanvasConfigRef.current
			if (!cfg) return
			const res = getNodeByKey(cfg, primaryKey)
			if (!res || !res.node || res.node.type !== 'Absolute') return

			const scale = getCanvasScale()
			const derivedW =
				primaryBox && scale > 0
					? Math.max(1, Math.round(primaryBox.w / scale))
					: 240
			const derivedH =
				primaryBox && scale > 0
					? Math.max(1, Math.round(primaryBox.h / scale))
					: 120

			const startX = intOrNull(res.node.x) ?? 0
			const startY = intOrNull(res.node.y) ?? 0
			const startW = intOrNull(res.node.width) ?? derivedW
			const startH = intOrNull(res.node.height) ?? derivedH

			if (
				intOrNull(res.node.width) == null ||
				intOrNull(res.node.height) == null
			) {
				onEditCanvasConfigChange(
					ensureAbsoluteSizeByKey(cfg, primaryKey, {
						width: startW,
						height: startH,
					}),
				)
			}

			dragRef.current = {
				kind: 'resize',
				key: primaryKey,
				targetsV: buildSnapTargets(new Set(selectedKeys)).v,
				targetsH: buildSnapTargets(new Set(selectedKeys)).h,
				handle,
				startClientX: e.clientX,
				startClientY: e.clientY,
				startX,
				startY,
				startW,
				startH,
				scale: scale > 0 ? scale : 1,
				pointerId: e.pointerId,
			}
			setIsDragging(true)
			setSnapGuides(null)
			onEditCanvasTransaction?.('start')

			try {
				previewWrapperRef.current?.setPointerCapture(e.pointerId)
			} catch {
				// ignore
			}

			e.preventDefault()
			e.stopPropagation()
		},
		[
			buildSnapTargets,
			canEditCanvas,
			getCanvasScale,
			hiddenKeySet,
			lockedKeySet,
			mode,
			onEditCanvasConfigChange,
			onEditCanvasTransaction,
			primaryBox,
			primaryKey,
			primaryType,
			selectedKeys,
		],
	)

	const computeBoxForEl = React.useCallback(
		(wrapper: HTMLElement, el: HTMLElement) => {
			const wRect = wrapper.getBoundingClientRect()
			const r = el.getBoundingClientRect()
			return {
				x: r.left - wRect.left,
				y: r.top - wRect.top,
				w: r.width,
				h: r.height,
			}
		},
		[],
	)

	const recomputeSelectionBoxes = React.useCallback(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper || selectedKeys.length === 0) {
			setPrimaryBox(null)
			setSelectedBoxesByKey(new Map())
			primaryElementRef.current = null
			return
		}
		const wanted = new Set(selectedKeys)
		const map = new Map<string, Box>()
		let primaryEl: HTMLElement | null = null

		const elements = wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
		for (const el of elements) {
			const k = el.getAttribute('data-tt-key')
			if (!k || !wanted.has(k)) continue
			const b = computeBoxForEl(wrapper, el)
			map.set(k, b)
			if (primaryKey && k === primaryKey) primaryEl = el
		}

		primaryElementRef.current = primaryEl
		setSelectedBoxesByKey(map)
		setPrimaryBox(primaryKey ? (map.get(primaryKey) ?? null) : null)
		if (primaryKey) {
			const nextType = primaryEl?.getAttribute('data-tt-type') ?? null
			if (nextType !== primaryType) setPrimaryType(nextType)
		}
	}, [computeBoxForEl, primaryKey, primaryType, selectedKeys])

	const recomputeHoverBox = React.useCallback(() => {
		const wrapper = previewWrapperRef.current
		if (!wrapper || !hoverNodeKey) {
			setHoverBox(null)
			return
		}
		let el = hoverElementRef.current
		if (
			!el ||
			!el.isConnected ||
			el.getAttribute('data-tt-key') !== hoverNodeKey
		) {
			setHoverBox(null)
			return
		}
		setHoverBox(computeBoxForEl(wrapper, el))
	}, [computeBoxForEl, hoverNodeKey])

	React.useEffect(() => {
		if (mode !== 'edit') {
			setPrimaryBox(null)
			setSelectedBoxesByKey(new Map())
			setHoverBox(null)
			setSnapGuides(null)
			return
		}
		const id = requestAnimationFrame(recomputeSelectionBoxes)
		return () => cancelAnimationFrame(id)
	}, [
		mode,
		editFrame,
		recomputeSelectionBoxes,
		templateId,
		templateConfig,
		viewPan.x,
		viewPan.y,
		viewScale,
	])

	React.useEffect(() => {
		if (mode !== 'edit') {
			setHoverBox(null)
			return
		}
		const id = requestAnimationFrame(recomputeHoverBox)
		return () => cancelAnimationFrame(id)
	}, [
		mode,
		editFrame,
		hoverNodeKey,
		recomputeHoverBox,
		viewPan.x,
		viewPan.y,
		viewScale,
	])

	React.useEffect(() => {
		if (mode !== 'edit') return
		const id = requestAnimationFrame(() => setCanvasScale(getCanvasScale()))
		return () => cancelAnimationFrame(id)
	}, [getCanvasScale, mode, editFrame, templateId, templateConfig])

	React.useEffect(() => {
		if (selectedKeys.length === 0) {
			if (primaryKey != null) setPrimaryKey(null)
			if (primaryType != null) setPrimaryType(null)
			primaryElementRef.current = null
			return
		}
		if (!primaryKey || !selectedKeys.includes(primaryKey)) {
			setPrimaryKey(selectedKeys[selectedKeys.length - 1] ?? null)
		}
	}, [primaryKey, primaryType, selectedKeys])

	return (
		<Card
			className={
				ui === 'canvas'
					? 'rounded-none border-0 bg-transparent py-0 shadow-none gap-0'
					: 'shadow-sm rounded-none'
			}
		>
			<CardContent className={ui === 'canvas' ? 'px-0' : 'space-y-4'}>
				{isLoading ? (
					ui === 'canvas' ? (
						<div className="flex h-full w-full items-center justify-center bg-muted/40">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<div className="space-y-3">
							<Skeleton className="h-[240px] w-full rounded-none" />
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t('states.loading')}
							</div>
						</div>
					)
				) : !thread || !root ? (
					<div
						className={
							ui === 'canvas'
								? 'flex h-full w-full items-center justify-center bg-muted/20'
								: 'flex flex-col items-center justify-center gap-3 rounded-none border border-dashed border-border/60 bg-muted/20 p-8 text-center'
						}
					>
						<AlertCircle className="h-6 w-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							{t('states.dataRequired')}
						</p>
					</div>
				) : !isClient ? (
					<div
						className={
							ui === 'canvas'
								? 'flex h-full w-full items-center justify-center bg-muted/40'
								: 'flex items-center justify-center h-[240px] w-full bg-muted/40 rounded-none'
						}
					>
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : inputProps ? (
					<div className={ui === 'canvas' ? undefined : 'space-y-3'}>
						{ui !== 'canvas' ? (
							<>
								<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-[10px] uppercase"
									disabled={!onEditUndo || !canEditUndo}
									onClick={() => onEditUndo?.()}
								>
									{t('buttons.undo')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-[10px] uppercase"
									disabled={!onEditRedo || !canEditRedo}
									onClick={() => onEditRedo?.()}
								>
									{t('buttons.redo')}
								</Button>
							</div>
							<div className="font-mono text-[10px] text-muted-foreground">
								{template.name} · {template.compositionWidth}×
								{template.compositionHeight}
							</div>
						</div>

						{mode === 'edit' ? (
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant={editScene === 'cover' ? 'default' : 'outline'}
									className="rounded-none font-mono text-[10px] uppercase"
									onClick={() => setEditFrame(0)}
								>
									{t('buttons.cover')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant={editScene === 'post' ? 'default' : 'outline'}
									className="rounded-none font-mono text-[10px] uppercase"
									onClick={() => {
										const f = timeline.coverDurationInFrames
										const max = Math.max(0, timeline.totalDurationInFrames - 1)
										setEditFrame(Math.min(f, max))
									}}
								>
									{t('buttons.post')}
								</Button>
								<div className="flex flex-1 items-center gap-2 min-w-[240px]">
									<input
										type="range"
										min={0}
										max={Math.max(0, timeline.totalDurationInFrames - 1)}
										value={editFrame}
										onChange={(e) => setEditFrame(Number(e.target.value))}
										className="w-full"
									/>
									<div className="tabular-nums font-mono text-[10px] text-muted-foreground">
										{editFrame}/
										{Math.max(0, timeline.totalDurationInFrames - 1)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('labels.snap')}
									</Label>
									<Switch
										checked={snapEnabled}
										onCheckedChange={setSnapEnabled}
									/>
								</div>
							</div>
						) : null}

						{mode === 'edit' ? (
							<div className="flex flex-wrap items-center gap-2">
								<div className="flex items-center gap-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('labels.tool')}
									</Label>
									<Button
										type="button"
										size="sm"
										variant={viewTool === 'select' ? 'default' : 'outline'}
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewTool('select')}
									>
										{t('buttons.select')}
									</Button>
									<Button
										type="button"
										size="sm"
										variant={viewTool === 'pan' ? 'default' : 'outline'}
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewTool('pan')}
									>
										{t('buttons.pan')}
									</Button>
								</div>
								<div className="flex items-center gap-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('labels.zoom')}
									</Label>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewScaleWithAnchor(0.5)}
									>
										50
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewScaleWithAnchor(2)}
									>
										200
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewScaleWithAnchor(viewScale / 1.1)}
									>
										-
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => {
											setViewScaleWithAnchor(1)
											setViewPan({ x: 0, y: 0 })
										}}
									>
										100
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={resetView}
									>
										{t('buttons.fit')}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={
											(!groupBox && !primaryBox) || selectedKeys.length === 0
										}
										onClick={fitSelection}
									>
										{t('buttons.fitSelection')}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										onClick={() => setViewScaleWithAnchor(viewScale * 1.1)}
									>
										+
									</Button>
									<div className="tabular-nums font-mono text-[10px] text-muted-foreground min-w-[46px] text-right">
										{Math.round(viewScale * 100)}%
									</div>
								</div>
							</div>
						) : null}

						{mode === 'edit' ? (
							<div className="flex flex-wrap items-center gap-2">
								<div className="flex flex-wrap items-center gap-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('labels.align')}
									</Label>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('left')}
									>
										L
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('hCenter')}
									>
										HC
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('right')}
									>
										R
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('top')}
									>
										T
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('vCenter')}
									>
										VC
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 2}
										onClick={() => alignSelection('bottom')}
									>
										B
									</Button>
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										{t('labels.distribute')}
									</Label>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 3}
										onClick={() => distributeSelection('horizontal')}
									>
										H
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
										disabled={!canEditCanvas || selectedAbsoluteKeys.length < 3}
										onClick={() => distributeSelection('vertical')}
									>
										V
									</Button>
								</div>
							</div>
						) : null}

						{mode === 'edit' ? (
							showLayers ? (
								<div className="rounded-none border border-border bg-card p-4 space-y-3">
									<div className="flex items-center justify-between gap-3">
										<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											{t('labels.layers')}
										</div>
										<div className="font-mono text-[10px] text-muted-foreground">
											{t('labels.nodes', { count: layerNodesByKey.size })}
										</div>
									</div>

									<Input
										placeholder={t('layers.filterPlaceholder')}
										value={layersFilter}
										onChange={(e) => setLayersFilter(e.target.value)}
										className="rounded-none font-mono text-xs h-8"
									/>

									<div
										className="rounded-none border border-border bg-muted/10"
										style={{ maxHeight: 300, overflow: 'auto' }}
									>
										<div className="p-2 space-y-3">
											{(['cover', 'post'] as const).map((scene) => {
												const roots =
													scene === 'cover'
														? layerRootsByScene.cover
														: layerRootsByScene.post
												const title =
													scene === 'cover' ? t('buttons.cover') : t('buttons.post')

												const renderNode = (key: string): React.ReactNode => {
													const n = layerNodesByKey.get(key)
													if (!n) return null
													if (
														layerVisibleKeySet &&
														!layerVisibleKeySet.has(key)
													)
														return null

													const isCollapsed = collapsedKeySet.has(key)
													const isSelected = selectedKeys.includes(key)
													const isPrimary = primaryKey === key
													const isHidden = hiddenKeySet.has(key)
													const isLocked = lockedKeySet.has(key)

													const canCollapse = n.children.length > 0

													return (
														<div key={key}>
															<div
																className="flex items-center gap-2 rounded-none px-2 py-1"
																style={{
																	background: isPrimary
																		? 'rgba(34,197,94,0.12)'
																		: isSelected
																			? 'rgba(34,197,94,0.06)'
																			: 'transparent',
																}}
															>
																<button
																	type="button"
																	onClick={() => {
																		if (!canCollapse) return
																		toggleCollapsed(key)
																	}}
																	className="font-mono text-[10px] text-muted-foreground"
																	style={{
																		width: 18,
																		opacity: canCollapse ? 1 : 0,
																		cursor: canCollapse ? 'pointer' : 'default',
																	}}
																>
																	{isCollapsed ? '▸' : '▾'}
																</button>

																<button
																	type="button"
																	onClick={(e) =>
																		selectFromLayers(key, n.type, e)
																	}
																	className="flex-1 text-left font-mono text-[11px]"
																	style={{
																		paddingLeft: Math.min(180, n.depth * 10),
																		opacity: isHidden ? 0.55 : 1,
																		textDecoration: isHidden
																			? 'line-through'
																			: undefined,
																	}}
																>
																	{n.type ?? t('labels.node')}{' '}
																	<span className="text-muted-foreground">
																		{key}
																	</span>
																</button>

																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
																	onClick={() => toggleHiddenSubtree(key)}
																>
																	{isHidden ? t('buttons.show') : t('buttons.hide')}
																</Button>
																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
																	onClick={() => toggleLockedSubtree(key)}
																>
																	{isLocked
																		? t('buttons.unlock')
																		: t('buttons.lock')}
																</Button>
															</div>
															{!isCollapsed && canCollapse ? (
																<div>
																	{n.children.map((c) => renderNode(c))}
																</div>
															) : null}
														</div>
													)
												}

												return (
													<div key={scene} className="space-y-2">
														<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
															{title}
														</div>
														<div className="space-y-1">
															{roots.map((k) => renderNode(k))}
														</div>
													</div>
												)
											})}
										</div>
									</div>

									<style>{`[data-tt-editor-hidden="1"]{opacity:0!important}`}</style>
								</div>
							) : null
						) : null}
							</>
						) : null}

						{(() => {
							const ratio =
								template.compositionHeight / template.compositionWidth
								const wrapperStyle: React.CSSProperties = {
									position: 'relative',
									width: '100%',
									paddingBottom: `${ratio * 100}%`,
									overflow: 'hidden',
									borderRadius: 0,
									border:
										ui === 'canvas' ? '0' : '1px solid hsl(var(--border))',
									cursor:
										mode !== 'edit'
											? 'default'
											: viewTool === 'pan'
											? isPanning
												? 'grabbing'
												: 'grab'
											: isDragging
												? 'grabbing'
												: hoverNodeType === 'Absolute' && canEditCanvas
													? 'grab'
													: 'default',
							}
							return (
								<div
									ref={previewWrapperRef}
									style={wrapperStyle}
									onPointerDownCapture={(e) => {
										if (mode !== 'edit') return
										if (dragRef.current || marquee?.active || panRef.current)
											return
										if (e.button === 2) return

										const wrapper = previewWrapperRef.current
										if (!wrapper) return

										// Pan tool (also allow middle button)
										if (viewTool === 'pan' || e.button === 1) {
											const start = viewPanRef.current
											panRef.current = {
												active: true,
												startClientX: e.clientX,
												startClientY: e.clientY,
												startPanX: start.x,
												startPanY: start.y,
												pointerId: e.pointerId,
											}
											setIsPanning(true)
											try {
												previewWrapperRef.current?.setPointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											e.preventDefault()
											return
										}

										// Only left-click selects/box-selects.
										if (e.button !== 0) return

										const picks: Array<{
											key: string
											type: string | null
											el: HTMLElement
										}> = []
										const seen = new Set<string>()
										const fromPoint = document.elementsFromPoint(
											e.clientX,
											e.clientY,
										)
										for (const hit of fromPoint) {
											const hitEl = hit as HTMLElement | null
											const el = hitEl?.closest?.(
												'[data-tt-key]',
											) as HTMLElement | null
											if (!el) continue
											if (!wrapper.contains(el)) continue
											const key = el.getAttribute('data-tt-key')
											if (!key) continue
											if (seen.has(key)) continue
											if (hiddenKeySet.has(key) || lockedKeySet.has(key))
												continue
											seen.add(key)
											picks.push({
												key,
												type: el.getAttribute('data-tt-type'),
												el,
											})
										}

										const now = Date.now()
										const prev = pickCycleRef.current
										const pickKeys = picks.map((p) => p.key)
										const sameSpot =
											prev &&
											Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 3 &&
											now - prev.t < 800 &&
											prev.keys.join('|') === pickKeys.join('|')

										const picked =
											picks.length === 0
												? null
												: sameSpot && primaryKey
													? (() => {
															const idx = pickKeys.indexOf(primaryKey)
															if (idx < 0) return picks[0]
															return picks[(idx + 1) % picks.length] ?? picks[0]
														})()
													: picks[0]

										pickCycleRef.current = {
											x: e.clientX,
											y: e.clientY,
											t: now,
											keys: pickKeys,
										}

										if (!picked) {
											const r = wrapper.getBoundingClientRect()
											const x = e.clientX - r.left
											const y = e.clientY - r.top
											if (!e.shiftKey) {
												setSelectedKeys([])
												setPrimaryKey(null)
												setPrimaryType(null)
												setPrimaryBox(null)
												setSelectedBoxesByKey(new Map())
												primaryElementRef.current = null
											}
											setMarquee({
												active: true,
												startX: x,
												startY: y,
												x,
												y,
												w: 0,
												h: 0,
												additive: e.shiftKey,
												baseSelectedKeys: selectedKeys.slice(),
												pointerId: e.pointerId,
											})
											try {
												previewWrapperRef.current?.setPointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											e.preventDefault()
											return
										}

										const key = picked.key
										const type = picked.type
										const el = picked.el
										let nextKeys: string[] = []
										if (e.shiftKey) {
											const cur = selectedKeys.slice()
											const idx = cur.indexOf(key)
											if (idx >= 0) cur.splice(idx, 1)
											else cur.push(key)
											nextKeys = cur
										} else {
											nextKeys = [key]
										}

										if (nextKeys.length === 0) {
											setSelectedKeys([])
											setPrimaryKey(null)
											setPrimaryType(null)
											primaryElementRef.current = null
											setPrimaryBox(null)
											setSelectedBoxesByKey(new Map())
											return
										}

										const nextPrimaryKey = nextKeys.includes(key)
											? key
											: primaryKey && nextKeys.includes(primaryKey)
												? primaryKey
												: (nextKeys[nextKeys.length - 1] ?? null)

										setSelectedKeys(nextKeys)
										setPrimaryKey(nextPrimaryKey)

										if (nextPrimaryKey === key) {
											setPrimaryType(type)
											primaryElementRef.current = el
											{
												const wrapper = previewWrapperRef.current
												if (wrapper) setPrimaryBox(computeBoxForEl(wrapper, el))
											}
										} else if (nextPrimaryKey) {
											const wrapper = previewWrapperRef.current
											if (wrapper) {
												const candidates =
													wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
												let nextPrimaryEl: HTMLElement | null = null
												for (const c of candidates) {
													if (
														c.getAttribute('data-tt-key') === nextPrimaryKey
													) {
														nextPrimaryEl = c
														break
													}
												}
												primaryElementRef.current = nextPrimaryEl
												setPrimaryType(
													nextPrimaryEl?.getAttribute('data-tt-type') ?? null,
												)
												setPrimaryBox(
													nextPrimaryEl
														? computeBoxForEl(wrapper, nextPrimaryEl)
														: null,
												)
											}
										}
										{
											const wrapper = previewWrapperRef.current
											setSelectedBoxesByKey((prev) => {
												const next = new Map<string, Box>()
												for (const k of nextKeys) {
													const b = prev.get(k)
													if (b) next.set(k, b)
												}
												if (wrapper) next.set(key, computeBoxForEl(wrapper, el))
												return next
											})
										}

										if (!canEditCanvas) return
										if (type !== 'Absolute') return
										const cfg = editCanvasConfigRef.current
										if (!cfg) return

										const scale = getCanvasScale()
										const safeScale = scale > 0 ? scale : 1
										const wrapperEl = previewWrapperRef.current
										if (!wrapperEl) return

										const candidates =
											wrapperEl.querySelectorAll<HTMLElement>('[data-tt-key]')
										const getElByKey = (k: string) => {
											if (k === key) return el
											for (const c of candidates) {
												if (c.getAttribute('data-tt-key') === k) return c
											}
											return null
										}

										const moveKeys: string[] = []
										const startRectsByKey: Record<
											string,
											{ x: number; y: number; w: number; h: number }
										> = {}

										for (const k of nextKeys) {
											if (hiddenKeySet.has(k) || lockedKeySet.has(k)) continue
											const res = getNodeByKey(cfg, k)
											if (!res?.node || res.node.type !== 'Absolute') continue
											const node = res.node as any
											const startX = intOrNull(node.x) ?? 0
											const startY = intOrNull(node.y) ?? 0

											const nodeEl = getElByKey(k)
											const derivedW = nodeEl
												? Math.max(
														1,
														Math.round(
															nodeEl.getBoundingClientRect().width / safeScale,
														),
													)
												: 240
											const derivedH = nodeEl
												? Math.max(
														1,
														Math.round(
															nodeEl.getBoundingClientRect().height / safeScale,
														),
													)
												: 120
											const startW = intOrNull(node.width) ?? derivedW
											const startH = intOrNull(node.height) ?? derivedH

											moveKeys.push(k)
											startRectsByKey[k] = {
												x: startX,
												y: startY,
												w: startW,
												h: startH,
											}
										}

										if (moveKeys.length === 0) return

										let minX = Number.POSITIVE_INFINITY
										let minY = Number.POSITIVE_INFINITY
										let maxX = Number.NEGATIVE_INFINITY
										let maxY = Number.NEGATIVE_INFINITY
										for (const k of moveKeys) {
											const r = startRectsByKey[k]
											minX = Math.min(minX, r.x)
											minY = Math.min(minY, r.y)
											maxX = Math.max(maxX, r.x + r.w)
											maxY = Math.max(maxY, r.y + r.h)
										}
										const groupStart = {
											x: Number.isFinite(minX) ? minX : 0,
											y: Number.isFinite(minY) ? minY : 0,
											w: Number.isFinite(maxX - minX)
												? Math.max(1, maxX - minX)
												: 1,
											h: Number.isFinite(maxY - minY)
												? Math.max(1, maxY - minY)
												: 1,
										}

										dragRef.current = {
											kind: 'move',
											primaryKey: key,
											keys: moveKeys,
											startRectsByKey,
											groupStart,
											targetsV: buildSnapTargets(new Set(moveKeys)).v,
											targetsH: buildSnapTargets(new Set(moveKeys)).h,
											axisLock: null,
											startClientX: e.clientX,
											startClientY: e.clientY,
											scale: safeScale,
											pointerId: e.pointerId,
										}
										setIsDragging(true)
										setSnapGuides(null)
										onEditCanvasTransaction?.('start')
										try {
											previewWrapperRef.current?.setPointerCapture(e.pointerId)
										} catch {
											// ignore
										}
										e.preventDefault()
									}}
									onPointerMoveCapture={(e) => {
										if (mode !== 'edit') return
										if (
											panRef.current &&
											e.pointerId === panRef.current.pointerId
										) {
											const p = panRef.current
											setViewPan({
												x: Math.round(
													p.startPanX + (e.clientX - p.startClientX),
												),
												y: Math.round(
													p.startPanY + (e.clientY - p.startClientY),
												),
											})
											e.preventDefault()
											return
										}
										if (marquee?.active && e.pointerId === marquee.pointerId) {
											const wrapper = previewWrapperRef.current
											if (!wrapper) return
											const r = wrapper.getBoundingClientRect()
											const cx = e.clientX - r.left
											const cy = e.clientY - r.top
											const x0 = Math.min(marquee.startX, cx)
											const y0 = Math.min(marquee.startY, cy)
											const x1 = Math.max(marquee.startX, cx)
											const y1 = Math.max(marquee.startY, cy)
											setMarquee({
												...marquee,
												x: x0,
												y: y0,
												w: x1 - x0,
												h: y1 - y0,
											})
											e.preventDefault()
											return
										}
										if (viewTool === 'pan') return
										if (!dragRef.current) {
											const target = e.target as HTMLElement | null
											const el = target?.closest?.(
												'[data-tt-key]',
											) as HTMLElement | null
											const key = el?.getAttribute('data-tt-key') ?? null
											const type = el?.getAttribute('data-tt-type') ?? null
											if (key !== hoverNodeKey) setHoverNodeKey(key)
											if (type !== hoverNodeType) setHoverNodeType(type)
											hoverElementRef.current = el
											{
												const wrapper = previewWrapperRef.current
												if (wrapper && el)
													setHoverBox(computeBoxForEl(wrapper, el))
												else setHoverBox(null)
											}
										}

										const d = dragRef.current
										if (!d) return
										if (!canEditCanvas) return
										const cfg = editCanvasConfigRef.current
										if (!cfg || !onEditCanvasConfigChange) return
										if (e.pointerId !== d.pointerId) return

										const dx = (e.clientX - d.startClientX) / d.scale
										const dy = (e.clientY - d.startClientY) / d.scale
										let ndx = dx
										let ndy = dy

										const snapActive = snapEnabled && e.altKey !== true
										const canvasW = template.compositionWidth
										const canvasH = template.compositionHeight

										if (d.kind === 'move') {
											if (e.shiftKey) {
												if (!d.axisLock) {
													if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0)
														d.axisLock = 'x'
													else if (Math.abs(dy) > 0) d.axisLock = 'y'
												}
												if (d.axisLock === 'x') ndy = 0
												if (d.axisLock === 'y') ndx = 0
											} else {
												d.axisLock = null
											}

											const rawX = Math.round(d.groupStart.x + ndx)
											const rawY = Math.round(d.groupStart.y + ndy)
											const w = d.groupStart.w
											const h = d.groupStart.h
											const snapped = applySnapMove({
												x: rawX,
												y: rawY,
												w,
												h,
												canvasW,
												canvasH,
												targetsV: d.targetsV,
												targetsH: d.targetsH,
												enabled: snapActive,
											})
											setSnapGuides(
												snapped.guides.v.length || snapped.guides.h.length
													? snapped.guides
													: null,
											)
											const deltaX = snapped.x - rawX
											const deltaY = snapped.y - rawY
											let nextCfg = cfg
											for (const k of d.keys) {
												const start = d.startRectsByKey[k]
												if (!start) continue
												nextCfg = setAbsolutePositionByKey(nextCfg, k, {
													x: Math.round(start.x + ndx + deltaX),
													y: Math.round(start.y + ndy + deltaY),
												})
											}
											onEditCanvasConfigChange(nextCfg)
											e.preventDefault()
											return
										}

										const rawX = d.startX
										const rawY = d.startY
										const rawW = d.startW
										const rawH = d.startH

										let nextX = rawX
										let nextY = rawY
										let nextW = rawW
										let nextH = rawH

										const handle = d.handle
										if (handle.includes('e')) nextW = rawW + dx
										if (handle.includes('s')) nextH = rawH + dy
										if (handle.includes('w')) {
											nextX = rawX + dx
											nextW = rawW - dx
										}
										if (handle.includes('n')) {
											nextY = rawY + dy
											nextH = rawH - dy
										}

										if (nextW < 1) {
											nextW = 1
											if (handle.includes('w')) nextX = rawX + (rawW - 1)
										}
										if (nextH < 1) {
											nextH = 1
											if (handle.includes('n')) nextY = rawY + (rawH - 1)
										}

										const snapped = applySnapResize({
											x: Math.round(nextX),
											y: Math.round(nextY),
											w: Math.round(nextW),
											h: Math.round(nextH),
											canvasW,
											canvasH,
											targetsV: d.targetsV,
											targetsH: d.targetsH,
											handle,
											enabled: snapActive,
										})
										setSnapGuides(
											snapped.guides.v.length || snapped.guides.h.length
												? snapped.guides
												: null,
										)
										onEditCanvasConfigChange(
											setAbsoluteRectByKey(cfg, d.key, {
												x: Math.round(snapped.x),
												y: Math.round(snapped.y),
												width: Math.round(snapped.w),
												height: Math.round(snapped.h),
											}),
										)
										e.preventDefault()
									}}
									onWheelCapture={(e) => {
										if (mode !== 'edit') return
										const allow = viewTool === 'pan' || e.ctrlKey || e.metaKey
										if (!allow) return
										const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
										setViewScaleWithAnchor(viewScaleRef.current * factor, {
											x: e.clientX,
											y: e.clientY,
										})
										e.preventDefault()
									}}
									onPointerUpCapture={(e) => {
										if (
											panRef.current &&
											e.pointerId === panRef.current.pointerId
										) {
											panRef.current = undefined
											setIsPanning(false)
											try {
												previewWrapperRef.current?.releasePointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											e.preventDefault()
											return
										}
										if (marquee?.active && e.pointerId === marquee.pointerId) {
											const wrapper = previewWrapperRef.current
											if (!wrapper) return
											const clickOnly = marquee.w < 3 && marquee.h < 3
											if (!clickOnly) {
												const elements =
													wrapper.querySelectorAll<HTMLElement>('[data-tt-key]')
												const r = wrapper.getBoundingClientRect()
												const x0 = marquee.x
												const y0 = marquee.y
												const x1 = marquee.x + marquee.w
												const y1 = marquee.y + marquee.h

												const hits: string[] = []
												for (const el of elements) {
													const key = el.getAttribute('data-tt-key')
													if (!key) continue
													if (hiddenKeySet.has(key) || lockedKeySet.has(key))
														continue
													const er = el.getBoundingClientRect()
													const areaRatio =
														(er.width * er.height) / (r.width * r.height)
													if (areaRatio > 0.92) continue
													const left = er.left - r.left
													const top = er.top - r.top
													const right = left + er.width
													const bottom = top + er.height
													const intersects =
														right >= x0 &&
														left <= x1 &&
														bottom >= y0 &&
														top <= y1
													if (!intersects) continue
													hits.push(key)
												}

												const nextKeys = marquee.additive
													? Array.from(
															new Set([...marquee.baseSelectedKeys, ...hits]),
														)
													: hits

												if (nextKeys.length === 0) {
													setSelectedKeys([])
													setPrimaryKey(null)
													setPrimaryType(null)
													setPrimaryBox(null)
													setSelectedBoxesByKey(new Map())
													primaryElementRef.current = null
												} else {
													const nextPrimaryKey =
														hits[hits.length - 1] ??
														(primaryKey && nextKeys.includes(primaryKey)
															? primaryKey
															: (nextKeys[nextKeys.length - 1] ?? null))

													setSelectedKeys(nextKeys)
													setPrimaryKey(nextPrimaryKey)

													if (nextPrimaryKey) {
														let primaryEl: HTMLElement | null = null
														const elements =
															wrapper.querySelectorAll<HTMLElement>(
																'[data-tt-key]',
															)
														for (const el of elements) {
															if (
																el.getAttribute('data-tt-key') ===
																nextPrimaryKey
															) {
																primaryEl = el
																break
															}
														}
														primaryElementRef.current = primaryEl
														setPrimaryType(
															primaryEl?.getAttribute('data-tt-type') ?? null,
														)
														setPrimaryBox(
															primaryEl
																? computeBoxForEl(wrapper, primaryEl)
																: null,
														)
													}
												}
											}

											setMarquee(null)
											try {
												previewWrapperRef.current?.releasePointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											e.preventDefault()
											return
										}
										if (e.pointerId !== dragRef.current?.pointerId) return
										dragRef.current = undefined
										setIsDragging(false)
										setSnapGuides(null)
										onEditCanvasTransaction?.('end')
										try {
											previewWrapperRef.current?.releasePointerCapture(
												e.pointerId,
											)
										} catch {
											// ignore
										}
									}}
									onPointerCancelCapture={(e) => {
										if (
											panRef.current &&
											e.pointerId === panRef.current.pointerId
										) {
											panRef.current = undefined
											setIsPanning(false)
											try {
												previewWrapperRef.current?.releasePointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											return
										}
										if (marquee?.active && e.pointerId === marquee.pointerId) {
											setMarquee(null)
											try {
												previewWrapperRef.current?.releasePointerCapture(
													e.pointerId,
												)
											} catch {
												// ignore
											}
											return
										}
										if (e.pointerId !== dragRef.current?.pointerId) return
										dragRef.current = undefined
										setIsDragging(false)
										setSnapGuides(null)
										onEditCanvasTransaction?.('end')
										try {
											previewWrapperRef.current?.releasePointerCapture(
												e.pointerId,
											)
										} catch {
											// ignore
										}
									}}
									onPointerLeave={() => {
										if (dragRef.current) return
										hoverElementRef.current = null
										setHoverNodeKey(null)
										setHoverNodeType(null)
										setHoverBox(null)
									}}
								>
									{mode === 'edit' ? (
										<style>
											{`
												[data-tt-key] { pointer-events: auto !important; }
												`}
										</style>
									) : null}
										<div
											style={{
												position: 'absolute',
												inset: 0,
											transform:
												mode === 'edit'
													? `translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewScale})`
													: undefined,
												transformOrigin: mode === 'edit' ? '0 0' : undefined,
											}}
										>
											<ThreadRemotionEditorCard
												ref={thumbnailRef as any}
												component={TemplateComponent}
												inputProps={inputProps}
												frameToDisplay={editFrame}
												durationInFrames={timeline.totalDurationInFrames}
												compositionWidth={template.compositionWidth}
												compositionHeight={template.compositionHeight}
												fps={REMOTION_FPS}
												style={{
													width: '100%',
													height: '100%',
													backgroundColor: '#0b1120',
												}}
											/>
										</div>

									{mode === 'edit' &&
									snapGuides &&
									(snapGuides.v.length > 0 || snapGuides.h.length > 0) ? (
										<div
											className="pointer-events-none"
											style={{ position: 'absolute', inset: 0 }}
										>
											{snapGuides.v.map((g, idx) => (
												<div
													key={`v-${idx}`}
													style={{
														position: 'absolute',
														left: viewPan.x + g.pos * canvasScale,
														top: 0,
														bottom: 0,
														width: 1,
														background: 'rgba(34,197,94,0.65)',
													}}
												/>
											))}
											{snapGuides.v.map((g, idx) => (
												<div
													key={`v-label-${idx}`}
													style={{
														position: 'absolute',
														left: viewPan.x + g.pos * canvasScale + 6,
														top: 6,
														padding: '2px 6px',
														background: 'rgba(2,6,23,0.75)',
														border: '1px solid rgba(34,197,94,0.35)',
														color: 'rgba(226,232,240,0.95)',
														fontFamily:
															'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
														fontSize: 10,
														lineHeight: 1.2,
														maxWidth: 260,
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{g.label}
												</div>
											))}
											{snapGuides.h.map((g, idx) => (
												<div
													key={`h-${idx}`}
													style={{
														position: 'absolute',
														top: viewPan.y + g.pos * canvasScale,
														left: 0,
														right: 0,
														height: 1,
														background: 'rgba(34,197,94,0.65)',
													}}
												/>
											))}
											{snapGuides.h.map((g, idx) => (
												<div
													key={`h-label-${idx}`}
													style={{
														position: 'absolute',
														top: viewPan.y + g.pos * canvasScale + 6,
														left: 6,
														padding: '2px 6px',
														background: 'rgba(2,6,23,0.75)',
														border: '1px solid rgba(34,197,94,0.35)',
														color: 'rgba(226,232,240,0.95)',
														fontFamily:
															'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
														fontSize: 10,
														lineHeight: 1.2,
														maxWidth: 260,
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{g.label}
												</div>
											))}
										</div>
									) : null}

									{mode === 'edit' && hoverBox ? (
										<div
											className="pointer-events-none"
											style={{ position: 'absolute', inset: 0 }}
										>
											<div
												style={{
													position: 'absolute',
													left: hoverBox.x,
													top: hoverBox.y,
													width: hoverBox.w,
													height: hoverBox.h,
													border: '1px dashed rgba(34,197,94,0.6)',
													boxSizing: 'border-box',
												}}
											/>
										</div>
									) : null}

									{mode === 'edit' && marquee?.active ? (
										<div
											className="pointer-events-none"
											style={{ position: 'absolute', inset: 0 }}
										>
											<div
												style={{
													position: 'absolute',
													left: marquee.x,
													top: marquee.y,
													width: marquee.w,
													height: marquee.h,
													border: '1px dashed rgba(148,163,184,0.85)',
													background: 'rgba(148,163,184,0.10)',
													boxSizing: 'border-box',
												}}
											/>
										</div>
									) : null}

									{mode === 'edit' && selectedKeys.length > 0 ? (
										<div
											className="pointer-events-none"
											style={{ position: 'absolute', inset: 0 }}
										>
											{groupBox ? (
												<div
													style={{
														position: 'absolute',
														left: groupBox.x,
														top: groupBox.y,
														width: groupBox.w,
														height: groupBox.h,
														border: '1px dashed rgba(34,197,94,0.35)',
														boxSizing: 'border-box',
													}}
												/>
											) : null}
											{selectedKeys.map((k) => {
												const b = selectedBoxesByKey.get(k)
												if (!b) return null
												const isPrimary = primaryKey != null && k === primaryKey
												return (
													<div
														key={k}
														style={{
															position: 'absolute',
															left: b.x,
															top: b.y,
															width: b.w,
															height: b.h,
															border: isPrimary
																? '1px solid rgba(34,197,94,0.92)'
																: '1px dashed rgba(34,197,94,0.55)',
															boxShadow: isPrimary
																? '0 0 0 1px rgba(0,0,0,0.35)'
																: undefined,
															boxSizing: 'border-box',
														}}
													/>
												)
											})}
										</div>
									) : null}

									{mode === 'edit' &&
									primaryBox &&
									primaryKey &&
									primaryType === 'Absolute' ? (
										<div
											className="pointer-events-none"
											style={{ position: 'absolute', inset: 0 }}
										>
											{(() => {
												const size = 10
												const half = size / 2
												const x0 = primaryBox.x
												const y0 = primaryBox.y
												const x1 = primaryBox.x + primaryBox.w
												const y1 = primaryBox.y + primaryBox.h
												const cx = primaryBox.x + primaryBox.w / 2
												const cy = primaryBox.y + primaryBox.h / 2

												const handles = [
													{
														k: 'nw',
														x: x0 - half,
														y: y0 - half,
														cursor: 'nwse-resize',
													},
													{
														k: 'ne',
														x: x1 - half,
														y: y0 - half,
														cursor: 'nesw-resize',
													},
													{
														k: 'sw',
														x: x0 - half,
														y: y1 - half,
														cursor: 'nesw-resize',
													},
													{
														k: 'se',
														x: x1 - half,
														y: y1 - half,
														cursor: 'nwse-resize',
													},
													{
														k: 'n',
														x: cx - half,
														y: y0 - half,
														cursor: 'ns-resize',
													},
													{
														k: 's',
														x: cx - half,
														y: y1 - half,
														cursor: 'ns-resize',
													},
													{
														k: 'w',
														x: x0 - half,
														y: cy - half,
														cursor: 'ew-resize',
													},
													{
														k: 'e',
														x: x1 - half,
														y: cy - half,
														cursor: 'ew-resize',
													},
												] as const

												return handles.map((h) => (
													<div
														key={h.k}
														className="pointer-events-auto"
														onPointerDown={(e) => beginResize(h.k as any, e)}
														style={{
															position: 'absolute',
															left: h.x,
															top: h.y,
															width: size,
															height: size,
															background: canEditCanvas
																? 'rgba(34,197,94,0.95)'
																: 'rgba(148,163,184,0.9)',
															border: '1px solid rgba(0,0,0,0.35)',
															boxSizing: 'border-box',
															cursor: canEditCanvas ? h.cursor : 'not-allowed',
															pointerEvents: canEditCanvas ? 'auto' : 'none',
														}}
													/>
												))
											})()}
										</div>
									) : null}
								</div>
							)
						})()}

						{ui !== 'canvas' && mode === 'edit' ? (
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="font-mono text-[10px] text-muted-foreground">
									{t('status.line', {
										scene: editScene,
										frame: editFrame,
										seconds: (editFrame / REMOTION_FPS).toFixed(2),
									})}
								</div>
								<div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
									{hoverNodeKey &&
									(!primaryKey || hoverNodeKey !== primaryKey) ? (
										<span>
											{t('status.hover', {
												type: hoverNodeType ?? t('labels.node'),
											})}
										</span>
									) : null}
									{primaryKey ? (
										<>
											<span className="text-foreground">
												{t('status.selected', {
													type: primaryType ?? t('labels.node'),
												})}
												{selectedKeys.length > 1
													? ` ×${selectedKeys.length}`
													: ''}
											</span>
											<span className="max-w-[360px] truncate">
												{primaryKey}
											</span>
											{primaryType === 'Absolute' && !canEditCanvas ? (
												<span>{t('status.switchToVisualToDrag')}</span>
											) : null}
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
												onClick={() => {
													void navigator.clipboard
														?.writeText(primaryKey)
														.catch(() => {})
												}}
											>
												{t('buttons.copyKey')}
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase h-7 px-2"
												onClick={() => {
													setSelectedKeys([])
													setPrimaryKey(null)
													setPrimaryType(null)
													primaryElementRef.current = null
													setPrimaryBox(null)
													setSelectedBoxesByKey(new Map())
												}}
											>
												{t('buttons.clear')}
											</Button>
										</>
									) : (
										<span>{t('status.tip')}</span>
									)}
								</div>
							</div>
						) : null}

						{ui !== 'canvas' && mode === 'edit' ? (
							showInspector ? (
								<div className="rounded-none border border-border bg-card p-4 space-y-4">
									<div className="flex items-center justify-between gap-3">
										<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											{t('labels.inspector')}
										</div>
										{primaryType ? (
											<div className="font-mono text-[10px] text-muted-foreground">
												{primaryType}
												{selectedKeys.length > 1
													? ` ×${selectedKeys.length}`
													: ''}
											</div>
										) : null}
									</div>

									{(() => {
										if (!primaryKey || !primaryType)
											return (
												<div className="font-mono text-xs text-muted-foreground">
													{t('inspector.empty')}
												</div>
											)

										const cfg = editCanvasConfigRef.current
										if (!cfg)
											return (
												<div className="font-mono text-xs text-muted-foreground">
													{t('inspector.noEditCanvasConfig')}
												</div>
											)

										const res = getNodeByKey(cfg, primaryKey)
										if (!res)
											return (
												<div className="font-mono text-xs text-muted-foreground">
													{t('inspector.nodeNotFound')}
												</div>
											)

										const node = res.node as any

										const commit = (updater: (n: any) => any) => {
											if (!onEditCanvasConfigChange) return
											onEditCanvasConfigChange(
												updateNodeByKey(cfg, primaryKey, updater),
											)
										}

										const numberField = (
											label: string,
											value: unknown,
											onCommit: (n: number | undefined) => void,
											opts?: { step?: number },
										) => {
											return (
												<div className="space-y-1">
													<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
														{label}
													</Label>
													<Input
														type="number"
														inputMode="numeric"
														step={opts?.step ?? 1}
														value={toNumberInputValue(value)}
														onChange={(e) => {
															const t = e.target.value.trim()
															if (!t) return onCommit(undefined)
															const n = Number(t)
															onCommit(Number.isFinite(n) ? n : undefined)
														}}
														className="rounded-none font-mono text-xs h-8"
													/>
												</div>
											)
										}

										const boolField = (
											label: string,
											value: unknown,
											onCommit: (b: boolean) => void,
										) => {
											const checked = value === true
											return (
												<div className="flex items-center justify-between gap-3 rounded-none border border-border px-3 py-2">
													<div className="font-mono text-xs text-foreground">
														{label}
													</div>
													<Switch
														checked={checked}
														onCheckedChange={onCommit}
													/>
												</div>
											)
										}

										return (
											<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
												{numberField(
													'opacity',
													node.opacity,
													(v) =>
														commit((n) => ({
															...n,
															opacity:
																v == null
																	? undefined
																	: (clamp01(v) ?? undefined),
														})),
													{ step: 0.05 },
												)}

												{primaryType === 'Absolute' ? (
													<>
														{numberField('x', node.x, (v) =>
															commit((n) => ({
																...n,
																x: v == null ? undefined : Math.round(v),
															})),
														)}
														{numberField('y', node.y, (v) =>
															commit((n) => ({
																...n,
																y: v == null ? undefined : Math.round(v),
															})),
														)}
														{numberField('width', node.width, (v) =>
															commit((n) => ({
																...n,
																width:
																	v == null
																		? undefined
																		: Math.max(1, Math.round(v)),
															})),
														)}
														{numberField('height', node.height, (v) =>
															commit((n) => ({
																...n,
																height:
																	v == null
																		? undefined
																		: Math.max(1, Math.round(v)),
															})),
														)}
														{numberField('zIndex', node.zIndex, (v) =>
															commit((n) => ({
																...n,
																zIndex: v == null ? undefined : Math.round(v),
															})),
														)}
														{numberField(
															'rotate',
															node.rotate,
															(v) =>
																commit((n) => ({
																	...n,
																	rotate: v == null ? undefined : v,
																})),
															{ step: 1 },
														)}
														{numberField(
															'scale',
															node.scale,
															(v) =>
																commit((n) => ({
																	...n,
																	scale: v == null ? undefined : v,
																})),
															{ step: 0.05 },
														)}
														{boolField(
															'pointerEvents',
															node.pointerEvents !== false,
															(v) =>
																commit((n) => ({
																	...n,
																	pointerEvents: v ? undefined : false,
																})),
														)}
													</>
												) : null}
											</div>
										)
									})()}
								</div>
							) : null
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}
