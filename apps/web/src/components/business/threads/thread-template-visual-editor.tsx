'use client'

import * as React from 'react'
import type {
	ThreadRenderTreeNode,
	ThreadTemplateConfigV1,
} from '@app/remotion-project/types'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import {
	ChevronRight,
	Copy,
	MoreHorizontal,
	Plus,
	Search,
	Trash2,
} from 'lucide-react'
import { useTranslations } from '~/lib/i18n'

type NodePath = Array<string | number>

type SceneKey = 'cover' | 'post'

type AssetRow = {
	id: string
	kind: 'image' | 'video' | 'avatar' | 'linkPreview' | 'audio' | string
	status?: string | null
}

type ParentSlot =
	| { kind: 'children'; index: number }
	| { kind: 'itemRoot' }

type TreeItem = {
	scene: SceneKey
	path: NodePath
	key: string
	depth: number
	label: string
	node: ThreadRenderTreeNode
	parentKey: string | null
	parentSlot: ParentSlot | null
}

const ADD_NODE_TYPES: Array<ThreadRenderTreeNode['type']> = [
	'Text',
	'Stack',
	'Box',
	'Grid',
	'Absolute',
	'Avatar',
	'Metrics',
	'ContentBlocks',
	'Repeat',
	'Image',
	'Video',
	'Background',
	'Spacer',
	'Divider',
]

function pathKey(scene: SceneKey, path: NodePath): string {
	return `${scene}:${JSON.stringify(path)}`
}

function isContainerNode(
	node: ThreadRenderTreeNode,
): node is Extract<
	ThreadRenderTreeNode,
	{ children?: ThreadRenderTreeNode[] }
> {
	return (
		node.type === 'Stack' ||
		node.type === 'Grid' ||
		node.type === 'Box' ||
		node.type === 'Absolute'
	)
}

function summarizeNode(node: ThreadRenderTreeNode): string {
	if (node.type === 'Text') {
		if (node.bind) return `Text · ${node.bind}`
		if (node.text)
			return `Text · "${node.text.slice(0, 24)}${node.text.length > 24 ? '…' : ''}"`
		return 'Text'
	}
	if (node.type === 'Avatar')
		return node.bind ? `Avatar · ${node.bind}` : 'Avatar'
	if (node.type === 'Metrics')
		return node.bind ? `Metrics · ${node.bind}` : 'Metrics'
	if (node.type === 'ContentBlocks')
		return node.bind ? `ContentBlocks · ${node.bind}` : 'ContentBlocks'
	if (node.type === 'Image')
		return `Image · ${String(node.assetId).slice(0, 16)}`
	if (node.type === 'Video')
		return `Video · ${String(node.assetId).slice(0, 16)}`
	if (node.type === 'Background')
		return node.assetId
			? `Background · ${String(node.assetId).slice(0, 16)}`
			: node.color
				? `Background · ${String(node.color).slice(0, 16)}`
				: 'Background'
	if (node.type === 'Repeat')
		return `Repeat · ${(node.source ?? 'replies') === 'replies' ? 'replies' : String(node.source)}`
	return node.type
}

function getChildEntries(
	node: ThreadRenderTreeNode,
): Array<{ slot: ParentSlot; child: ThreadRenderTreeNode }> {
	const out: Array<{ slot: ParentSlot; child: ThreadRenderTreeNode }> = []

	if (isContainerNode(node)) {
		const children = node.children ?? []
		for (let i = 0; i < children.length; i++)
			out.push({ slot: { kind: 'children', index: i }, child: children[i]! })
	}

	if (node.type === 'Repeat') {
		out.push({ slot: { kind: 'itemRoot' }, child: node.itemRoot })
	}

	return out
}

function pathForSlot(path: NodePath, slot: ParentSlot): NodePath {
	if (slot.kind === 'children') return [...path, 'children', slot.index]
	return [...path, 'itemRoot']
}

function getNodeAtPath(
	root: ThreadRenderTreeNode,
	path: NodePath,
): ThreadRenderTreeNode | null {
	let cur: any = root as any
	for (let i = 0; i < path.length; i++) {
		const seg = path[i]
		if (seg === 'children') {
			const idx = path[i + 1]
			if (typeof idx !== 'number') return null
			const children = cur?.children
			if (!Array.isArray(children)) return null
			cur = children[idx]
			i += 1
			continue
		}
		if (seg === 'itemRoot') {
			cur = cur?.itemRoot
			continue
		}
		return null
	}
	return cur ?? null
}

function updateNodeAtPath(
	root: ThreadRenderTreeNode,
	path: NodePath,
	updater: (node: ThreadRenderTreeNode) => ThreadRenderTreeNode,
): ThreadRenderTreeNode {
	if (path.length === 0) return updater(root)

	const seg = path[0]
	if (seg === 'children') {
		const idx = path[1]
		if (!isContainerNode(root) || typeof idx !== 'number') return root
		const children = (root.children ?? []).slice()
		const child = children[idx]
		if (!child) return root
		children[idx] = updateNodeAtPath(child, path.slice(2), updater)
		return { ...(root as any), children }
	}

	if (seg === 'itemRoot') {
		if (root.type !== 'Repeat') return root
		return {
			...(root as any),
			itemRoot: updateNodeAtPath(root.itemRoot, path.slice(1), updater),
		}
	}

	return root
}

function cloneJson<T>(value: T): T {
	try {
		return structuredClone(value)
	} catch {
		return JSON.parse(JSON.stringify(value)) as T
	}
}

function setNodeSlot(
	root: ThreadRenderTreeNode,
	slot: ParentSlot,
	nextChild: ThreadRenderTreeNode | undefined,
): ThreadRenderTreeNode {
	if (slot.kind === 'children') {
		if (!isContainerNode(root)) return root
		const children = (root.children ?? []).slice()
		children[slot.index] = nextChild as any
		return { ...(root as any), children }
	}
	if (slot.kind === 'itemRoot') {
		if (root.type === 'Repeat') {
			if (!nextChild) return root
			return { ...(root as any), itemRoot: nextChild }
		}
		return root
	}
	return root
}

function removeFromParent(
	root: ThreadRenderTreeNode,
	parentPath: NodePath,
	slot: ParentSlot,
): ThreadRenderTreeNode {
	if (parentPath.length === 0) {
		// Disallow removing the scene root.
		return root
	}

	const parent = getNodeAtPath(root, parentPath)
	if (!parent) return root

	const updated = (() => {
		if (slot.kind === 'children') {
			if (!isContainerNode(parent)) return parent
			const children = (parent.children ?? []).slice()
			children.splice(slot.index, 1)
			return { ...(parent as any), children }
		}
		return setNodeSlot(parent, slot, undefined)
	})()

	return updateNodeAtPath(root, parentPath, () => updated)
}

function insertChildAt(
	root: ThreadRenderTreeNode,
	parentPath: NodePath,
	index: number,
	child: ThreadRenderTreeNode,
): ThreadRenderTreeNode {
	const parent = getNodeAtPath(root, parentPath)
	if (!parent || !isContainerNode(parent)) return root
	const children = (parent.children ?? []).slice()
	const idx = Math.max(0, Math.min(children.length, index))
	children.splice(idx, 0, child)
	const updatedParent = { ...(parent as any), children }
	return updateNodeAtPath(root, parentPath, () => updatedParent)
}

function swapSiblings(
	root: ThreadRenderTreeNode,
	parentPath: NodePath,
	indexA: number,
	indexB: number,
): ThreadRenderTreeNode {
	const parent = getNodeAtPath(root, parentPath)
	if (!parent || !isContainerNode(parent)) return root
	const children = (parent.children ?? []).slice()
	if (!children[indexA] || !children[indexB]) return root
	;[children[indexA], children[indexB]] = [children[indexB]!, children[indexA]!]
	const updatedParent = { ...(parent as any), children }
	return updateNodeAtPath(root, parentPath, () => updatedParent)
}

function appendChild(
	root: ThreadRenderTreeNode,
	parentPath: NodePath,
	child: ThreadRenderTreeNode,
): ThreadRenderTreeNode {
	const parent = getNodeAtPath(root, parentPath)
	if (!parent || !isContainerNode(parent)) return root
	const children = [...(parent.children ?? []), child]
	const updatedParent = { ...(parent as any), children }
	return updateNodeAtPath(root, parentPath, () => updatedParent)
}

function createDefaultNode(
	type: ThreadRenderTreeNode['type'],
): ThreadRenderTreeNode {
	if (type === 'Stack')
		return { type: 'Stack', direction: 'column', gap: 14, children: [] }
	if (type === 'Grid')
		return { type: 'Grid', columns: 2, gap: 12, children: [] }
	if (type === 'Box') return { type: 'Box', padding: 12, children: [] }
	if (type === 'Absolute') return { type: 'Absolute', children: [] }
	if (type === 'Text')
		return { type: 'Text', text: 'Text', size: 28, weight: 700 }
	if (type === 'Avatar')
		return {
			type: 'Avatar',
			bind: 'root.author.avatarAssetId',
			size: 44,
			border: true,
			background: 'rgba(255,255,255,0.04)',
		}
	if (type === 'Metrics')
		return {
			type: 'Metrics',
			bind: 'post.metrics.likes',
			size: 14,
			showIcon: true,
		}
	if (type === 'ContentBlocks')
		return { type: 'ContentBlocks', bind: 'post.contentBlocks', gap: 14 }
	if (type === 'Image')
		return {
			type: 'Image',
			assetId: '__IMAGE_ASSET_ID__',
			fit: 'cover',
			height: 320,
			radius: 12,
			border: true,
		}
	if (type === 'Video')
		return {
			type: 'Video',
			assetId: '__VIDEO_ASSET_ID__',
			fit: 'cover',
			height: 360,
			radius: 12,
			border: true,
		}
	if (type === 'Background')
		return { type: 'Background', color: 'var(--tf-bg)', opacity: 1 }
	if (type === 'Spacer') return { type: 'Spacer', axis: 'y', size: 16 }
	if (type === 'Divider')
		return { type: 'Divider', axis: 'x', thickness: 1, opacity: 0.2 }
	if (type === 'Repeat')
		return {
			type: 'Repeat',
			source: 'replies',
			maxItems: 50,
			gap: 12,
			wrapItemRoot: true,
			highlight: {
				enabled: true,
				color: 'accent',
				thickness: 3,
				radius: 0,
				opacity: 1,
				},
				itemRoot: { type: 'Text', bind: 'post.plainText', maxLines: 10 },
			}
	return { type: 'Text', text: 'Text', size: 28, weight: 700 }
}

function buildTree(scene: SceneKey, root: ThreadRenderTreeNode): TreeItem[] {
	const out: TreeItem[] = []
	const walk = (
		node: ThreadRenderTreeNode,
		path: NodePath,
		depth: number,
		parentKey: string | null,
		parentSlot: ParentSlot | null,
	) => {
		const key = pathKey(scene, path)
		out.push({
			scene,
			path,
			key,
			depth,
			label: summarizeNode(node),
			node,
			parentKey,
			parentSlot,
		})

		const children = getChildEntries(node)
		for (const { slot, child } of children) {
			walk(child, pathForSlot(path, slot), depth + 1, key, slot)
		}
	}
	walk(root, [], 0, null, null)
	return out
}

type TreeNodeState = {
	collapsed: boolean
}

function buildChildrenMap(items: TreeItem[]) {
	const childrenByKey = new Map<string, string[]>()
	for (const it of items) {
		if (!it.parentKey) continue
		const list = childrenByKey.get(it.parentKey) ?? []
		list.push(it.key)
		childrenByKey.set(it.parentKey, list)
	}
	return childrenByKey
}

function buildAncestorsMap(items: TreeItem[]) {
	const parentByKey = new Map<string, string | null>()
	for (const it of items) parentByKey.set(it.key, it.parentKey)
	return parentByKey
}

function collectAncestors(
	key: string,
	parentByKey: Map<string, string | null>,
) {
	const out: string[] = []
	let cur: string | null | undefined = key
	while (cur) {
		const parent = parentByKey.get(cur)
		if (!parent) break
		out.push(parent)
		cur = parent
	}
	return out
}

type TreeFilterTermKind =
	| 'text'
	| 'type'
	| 'bind'
	| 'kind'
	| 'asset'
	| 'scene'
	| 'key'

type TreeFilterTerm = { kind: TreeFilterTermKind; value: string }

function parseTreeFilterTerms(filterText: string): TreeFilterTerm[] {
	const raw = filterText.trim()
	if (!raw) return []

	const parts = raw.split(/\s+/g).filter(Boolean)
	const out: TreeFilterTerm[] = []

	for (const part of parts) {
		const idx = part.indexOf(':')
		if (idx <= 0) {
			const value = part.trim().toLowerCase()
			if (value) out.push({ kind: 'text', value })
			continue
		}

		const kindRaw = part.slice(0, idx).trim().toLowerCase()
		const value = part
			.slice(idx + 1)
			.trim()
			.toLowerCase()
		if (!value) continue

		const kind = (
			kindRaw === 'type' ||
			kindRaw === 'bind' ||
			kindRaw === 'kind' ||
			kindRaw === 'asset' ||
			kindRaw === 'scene' ||
			kindRaw === 'key'
				? kindRaw
				: 'text'
		) as TreeFilterTermKind

		out.push({ kind, value })
	}

	return out
}

function getTreeItemSearchFields(it: TreeItem) {
	const node: any = it.node as any
	const type = String(node?.type ?? '').toLowerCase()
	const bind = typeof node?.bind === 'string' ? node.bind.toLowerCase() : ''
	const kind = type === 'builtin' ? String(node?.kind ?? '').toLowerCase() : ''
	const assetId =
		typeof node?.assetId === 'string' || typeof node?.assetId === 'number'
			? String(node.assetId).toLowerCase()
			: ''

	return {
		label: it.label.toLowerCase(),
		key: it.key.toLowerCase(),
		scene: it.scene.toLowerCase(),
		type,
		bind,
		kind,
		assetId,
	}
}

function matchesTreeFilter(it: TreeItem, terms: TreeFilterTerm[]): boolean {
	if (terms.length === 0) return true
	const f = getTreeItemSearchFields(it)

	for (const term of terms) {
		const v = term.value
		if (!v) continue

		if (term.kind === 'type' && !f.type.includes(v)) return false
		if (term.kind === 'bind' && !f.bind.includes(v)) return false
		if (term.kind === 'kind' && !f.kind.includes(v)) return false
		if (term.kind === 'asset' && !f.assetId.includes(v)) return false
		if (term.kind === 'scene' && !f.scene.includes(v)) return false
		if (term.kind === 'key' && !f.key.includes(v)) return false
		if (term.kind === 'text') {
			const ok =
				f.label.includes(v) ||
				f.key.includes(v) ||
				f.type.includes(v) ||
				f.bind.includes(v) ||
				f.kind.includes(v) ||
				f.assetId.includes(v) ||
				f.scene.includes(v)
			if (!ok) return false
		}
	}

	return true
}

function TreeView({
	items,
	childrenByKey,
	parentByKey,
	selectedKey,
	onSelectedKeyChange,
	filterText,
	state,
	onStateChange,
	onQuickAddChild,
	onQuickDuplicate,
	onQuickDelete,
	onOpenActions,
	t,
}: {
	items: TreeItem[]
	childrenByKey: Map<string, string[]>
	parentByKey: Map<string, string | null>
	selectedKey: string
	onSelectedKeyChange: (key: string) => void
	filterText: string
	state: Record<string, TreeNodeState>
	onStateChange: React.Dispatch<
		React.SetStateAction<Record<string, TreeNodeState>>
	>
	onQuickAddChild?: (key: string) => void
	onQuickDuplicate?: (key: string) => void
	onQuickDelete?: (key: string) => void
	onOpenActions?: (key: string) => void
	t?: (key: string, params?: Record<string, unknown>) => string
}) {
	const itemByKey = React.useMemo(() => {
		const m = new Map<string, TreeItem>()
		for (const it of items) m.set(it.key, it)
		return m
	}, [items])

	const selectedElRef = React.useRef<HTMLButtonElement | null>(null)
	React.useEffect(() => {
		selectedElRef.current?.scrollIntoView({ block: 'nearest' })
	}, [selectedKey])

	const terms = React.useMemo(
		() => parseTreeFilterTerms(filterText),
		[filterText],
	)
	const { visibleKeys, forcedOpenKeys } = React.useMemo(() => {
		if (terms.length === 0)
			return {
				visibleKeys: null as Set<string> | null,
				forcedOpenKeys: null as Set<string> | null,
			}

		const matched = new Set<string>()
		for (const it of items) {
			if (matchesTreeFilter(it, terms)) matched.add(it.key)
		}

		const visible = new Set<string>()
		const forcedOpen = new Set<string>()
		for (const key of matched) {
			visible.add(key)
			for (const a of collectAncestors(key, parentByKey)) {
				visible.add(a)
				forcedOpen.add(a)
			}
		}

		return { visibleKeys: visible, forcedOpenKeys: forcedOpen }
	}, [items, parentByKey, terms])

	const roots = React.useMemo(() => {
		const out: string[] = []
		for (const it of items) {
			if (!it.parentKey) out.push(it.key)
		}
		return out
	}, [items])

	const visibleItems = React.useMemo(() => {
		const out: TreeItem[] = []
		const walk = (key: string) => {
			const it = itemByKey.get(key)
			if (!it) return
			if (visibleKeys && !visibleKeys.has(key)) return

			out.push(it)

			const children = childrenByKey.get(key) ?? []
			if (children.length === 0) return

			const collapsed = state[key]?.collapsed ?? false
			if (terms.length === 0) {
				if (collapsed) return
			} else {
				if (collapsed && !(forcedOpenKeys?.has(key) ?? false)) return
			}

			for (const childKey of children) walk(childKey)
		}

		for (const rootKey of roots) walk(rootKey)
		return out
	}, [
		childrenByKey,
		forcedOpenKeys,
		itemByKey,
		roots,
		state,
		terms.length,
		visibleKeys,
	])

	function toggleCollapsed(key: string) {
		onStateChange((prev) => {
			const cur = prev[key]?.collapsed ?? false
			return { ...prev, [key]: { collapsed: !cur } }
		})
	}

	if (items.length === 0) {
		return (
			<div className="px-3 py-2 font-mono text-xs text-muted-foreground">
				{t?.('structure.noNodes') ?? 'No nodes.'}
			</div>
		)
	}

	return (
		<div className="space-y-0.5">
			{visibleItems.map((it) => {
				const active = it.key === selectedKey
				const children = childrenByKey.get(it.key) ?? []
				const hasChildren = children.length > 0
				const collapsed = state[it.key]?.collapsed ?? false
				const canQuickAddChild = Boolean(
					onQuickAddChild && isContainerNode(it.node),
				)
				const canQuickDuplicate = Boolean(
					onQuickDuplicate && it.parentSlot?.kind === 'children',
				)
				const canQuickDelete = Boolean(
					onQuickDelete && it.parentSlot?.kind === 'children',
				)
				const canOpenActions = Boolean(onOpenActions)

				return (
					<div
						key={it.key}
						className={[
							'group flex items-center gap-1 px-1',
							active ? 'bg-muted' : 'hover:bg-muted/40',
						].join(' ')}
					>
						<div
							className="flex items-center"
							style={{ paddingLeft: it.depth * 12 }}
						>
							<button
								type="button"
								disabled={!hasChildren}
								onClick={(e) => {
									e.stopPropagation()
									if (!hasChildren) return
									toggleCollapsed(it.key)
								}}
								className={[
									'flex size-6 items-center justify-center text-muted-foreground',
									hasChildren ? 'hover:text-foreground' : 'opacity-40',
								].join(' ')}
								aria-label={
									hasChildren
										? collapsed
											? (t?.('structure.expandAria') ?? 'Expand')
											: (t?.('structure.collapseAria') ?? 'Collapse')
										: (t?.('structure.leafNode') ?? 'Leaf node')
								}
							>
								<ChevronRight
									className={[
										'size-3 transition-transform',
										hasChildren && !collapsed ? 'rotate-90' : '',
									].join(' ')}
								/>
							</button>
						</div>

						<button
							ref={active ? selectedElRef : null}
							type="button"
							onClick={() => onSelectedKeyChange(it.key)}
							className={[
								'flex-1 truncate py-1.5 text-left font-mono text-xs',
								active
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground',
							].join(' ')}
							title={it.key}
						>
							{it.label}
						</button>

						{canQuickAddChild ||
						canQuickDuplicate ||
						canQuickDelete ||
						canOpenActions ? (
							<div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
								{canQuickAddChild ? (
									<button
										type="button"
										className="inline-flex size-6 items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
										title={t?.('structure.addChild') ?? 'Add Child'}
										aria-label={t?.('structure.addChild') ?? 'Add Child'}
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											onQuickAddChild?.(it.key)
										}}
									>
										<Plus className="size-3" />
									</button>
								) : null}

								{canQuickDuplicate ? (
									<button
										type="button"
										className="inline-flex size-6 items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
										title={t?.('structure.duplicate') ?? 'Duplicate'}
										aria-label={t?.('structure.duplicate') ?? 'Duplicate'}
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											onQuickDuplicate?.(it.key)
										}}
									>
										<Copy className="size-3" />
									</button>
								) : null}

								{canQuickDelete ? (
									<button
										type="button"
										className="inline-flex size-6 items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
										title={t?.('structure.delete') ?? 'Delete'}
										aria-label={t?.('structure.delete') ?? 'Delete'}
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											onQuickDelete?.(it.key)
										}}
									>
										<Trash2 className="size-3" />
									</button>
								) : null}

								{canOpenActions ? (
									<button
										type="button"
										className="inline-flex size-6 items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
										title={t?.('structure.actionsTitle') ?? 'Actions'}
										aria-label={t?.('structure.actionsTitle') ?? 'Actions'}
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											onOpenActions?.(it.key)
										}}
									>
										<MoreHorizontal className="size-3" />
									</button>
								) : null}
							</div>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

export function ThreadTemplateVisualEditor({
	value,
	onChange,
	baselineValue,
	assets = [],
	historyState,
	setHistoryState,
	resetKey,
	layout = 'split',
	structureClassName,
	propertiesClassName,
	structureCollapsed,
	onStructureCollapsedChange,
	propertiesCollapsed,
	onPropertiesCollapsedChange,
	showSceneToggle = true,
	hotkeysEnabled = true,
	scene: controlledScene,
	onSceneChange,
	selectedKey: controlledSelectedKey,
	onSelectedKeyChange,
}: {
	value: ThreadTemplateConfigV1
	onChange: (next: ThreadTemplateConfigV1) => void
	baselineValue?: ThreadTemplateConfigV1
	assets?: AssetRow[]
	historyState?: {
		past: ThreadTemplateConfigV1[]
		future: ThreadTemplateConfigV1[]
	}
	setHistoryState?: React.Dispatch<
		React.SetStateAction<{
			past: ThreadTemplateConfigV1[]
			future: ThreadTemplateConfigV1[]
		}>
	>
	resetKey?: string
	layout?: 'split' | 'panels'
	structureClassName?: string
	propertiesClassName?: string
	structureCollapsed?: boolean
	onStructureCollapsedChange?: (collapsed: boolean) => void
	propertiesCollapsed?: boolean
	onPropertiesCollapsedChange?: (collapsed: boolean) => void
	showSceneToggle?: boolean
	hotkeysEnabled?: boolean
	scene?: SceneKey
	onSceneChange?: (scene: SceneKey) => void
	selectedKey?: string
	onSelectedKeyChange?: (key: string) => void
}) {
	const t = useTranslations('ThreadTemplates.visualEditor')
	const skipNextValueResetRef = React.useRef(false)
	const txnRef = React.useRef<{ base: ThreadTemplateConfigV1 } | null>(null)
	const [internalHistory, setInternalHistory] = React.useState<{
		past: ThreadTemplateConfigV1[]
		future: ThreadTemplateConfigV1[]
	}>({ past: [], future: [] })
	const history = historyState ?? internalHistory
	const setHistory = setHistoryState ?? setInternalHistory
	const [internalScene, setInternalScene] = React.useState<SceneKey>('cover')
	const scene = controlledScene ?? internalScene
	const setScene = onSceneChange ?? setInternalScene
	const [internalSelectedKey, setInternalSelectedKey] = React.useState<string>(
		() => pathKey('cover', []),
	)
	const selectedKey = controlledSelectedKey ?? internalSelectedKey
	const setSelectedKey = onSelectedKeyChange ?? setInternalSelectedKey
	const [addType, setAddType] =
		React.useState<ThreadRenderTreeNode['type']>('Text')
	const [copiedNode, setCopiedNode] =
		React.useState<ThreadRenderTreeNode | null>(null)

	const sceneRoot = (value.scenes?.[scene]?.root ??
		null) as ThreadRenderTreeNode | null

	const coverSceneRoot = (value.scenes?.cover?.root ??
		null) as ThreadRenderTreeNode | null

	const postSceneRoot = (value.scenes?.post?.root ??
		null) as ThreadRenderTreeNode | null

	const baselineSceneRoot = (baselineValue?.scenes?.[scene]?.root ??
		null) as ThreadRenderTreeNode | null

	React.useEffect(() => {
		if (resetKey !== undefined) return
		if (skipNextValueResetRef.current) {
			skipNextValueResetRef.current = false
			return
		}
		setHistory({ past: [], future: [] })
		setCopiedNode(null)
		txnRef.current = null
	}, [value, resetKey, setHistory])

	React.useEffect(() => {
		if (resetKey === undefined) return
		setHistory({ past: [], future: [] })
		setCopiedNode(null)
		txnRef.current = null
	}, [resetKey, setHistory])

	const tree = React.useMemo(() => {
		if (!sceneRoot) return [] as TreeItem[]
		return buildTree(scene, sceneRoot)
	}, [scene, sceneRoot])

	const [treeFilter, setTreeFilter] = React.useState('')
	const treeFilterInputRef = React.useRef<HTMLInputElement | null>(null)
	const [actionsKey, setActionsKey] = React.useState<string | null>(null)

	const [jumpOpen, setJumpOpen] = React.useState(false)
	const [jumpQuery, setJumpQuery] = React.useState('')
	const jumpInputRef = React.useRef<HTMLInputElement | null>(null)

	const jumpCandidates = React.useMemo(() => {
		const out: TreeItem[] = []
		if (coverSceneRoot) out.push(...buildTree('cover', coverSceneRoot))
		if (postSceneRoot) out.push(...buildTree('post', postSceneRoot))
		return out
	}, [coverSceneRoot, postSceneRoot])

	const jumpTerms = React.useMemo(
		() => parseTreeFilterTerms(jumpQuery),
		[jumpQuery],
	)
	const jumpResults = React.useMemo(() => {
		if (jumpTerms.length === 0) return [] as TreeItem[]
		return jumpCandidates
			.filter((it) => matchesTreeFilter(it, jumpTerms))
			.slice(0, 120)
	}, [jumpCandidates, jumpTerms])

	React.useEffect(() => {
		if (!jumpOpen) return
		const id = window.setTimeout(() => {
			jumpInputRef.current?.focus()
			jumpInputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(id)
	}, [jumpOpen])

	function selectJumpResult(it: TreeItem) {
		setScene(it.scene)
		setSelectedKey(it.key)
		setJumpOpen(false)
		setJumpQuery('')
		setTreeFilter('')
	}

	const itemByKey = React.useMemo(() => {
		const m = new Map<string, TreeItem>()
		for (const it of tree) m.set(it.key, it)
		return m
	}, [tree])

	const actionsItem = actionsKey ? (itemByKey.get(actionsKey) ?? null) : null
	React.useEffect(() => {
		if (actionsKey && !actionsItem) setActionsKey(null)
	}, [actionsItem, actionsKey])

	const childrenByKey = React.useMemo(() => buildChildrenMap(tree), [tree])
	const parentByKey = React.useMemo(() => buildAncestorsMap(tree), [tree])

	const [treeState, setTreeState] = React.useState<
		Record<string, TreeNodeState>
	>({})

	React.useEffect(() => {
		setTreeState({})
	}, [resetKey, scene])

	React.useEffect(() => {
		const rootKey = pathKey(scene, [])
		if (itemByKey.has(selectedKey)) return
		setSelectedKey(rootKey)
	}, [itemByKey, scene, selectedKey])

	const selected = itemByKey.get(selectedKey) ?? null

	const pickableAssets = React.useMemo(() => {
		return assets
			.filter((a) => a.kind === 'image' || a.kind === 'video')
			.map((a) => ({ id: String(a.id), kind: String(a.kind) }))
	}, [assets])

	const pickableImageAssets = React.useMemo(() => {
		return assets
			.filter((a) => a.kind === 'image')
			.map((a) => ({ id: String(a.id), kind: String(a.kind) }))
	}, [assets])

	function createNodeToAdd(): ThreadRenderTreeNode {
		return createDefaultNode(addType)
	}

	function updateSceneRoot(nextRoot: ThreadRenderTreeNode) {
		const next = cloneJson(value) as ThreadTemplateConfigV1
		if (!next.scenes) next.scenes = {}
		if (!next.scenes[scene]) next.scenes[scene] = {}
		next.scenes[scene]!.root = nextRoot
		if (!txnRef.current) {
			const prev = cloneJson(value) as ThreadTemplateConfigV1
			setHistory((h) => ({
				past: [...h.past.slice(-199), prev],
				future: [],
			}))
		}
		skipNextValueResetRef.current = true
		onChange(next)
	}

	function updateSelected(
		updater: (node: ThreadRenderTreeNode) => ThreadRenderTreeNode,
	) {
		if (!sceneRoot || !selected) return
		updateSceneRoot(updateNodeAtPath(sceneRoot, selected.path, updater))
	}

	function undo() {
		txnRef.current = null
		if (history.past.length === 0) return
		const prev = history.past[history.past.length - 1]
		if (!prev) return
		const cur = cloneJson(value) as ThreadTemplateConfigV1
		setHistory({
			past: history.past.slice(0, -1),
			future: [...history.future, cur],
		})
		skipNextValueResetRef.current = true
		onChange(prev)
	}

	function redo() {
		txnRef.current = null
		if (history.future.length === 0) return
		const next = history.future[history.future.length - 1]
		if (!next) return
		const cur = cloneJson(value) as ThreadTemplateConfigV1
		setHistory({
			past: [...history.past, cur],
			future: history.future.slice(0, -1),
		})
		skipNextValueResetRef.current = true
		onChange(next)
	}

	function beginTxn() {
		if (txnRef.current) return
		txnRef.current = { base: cloneJson(value) as ThreadTemplateConfigV1 }
	}

	function endTxn() {
		const txn = txnRef.current
		txnRef.current = null
		if (!txn) return

		const before = JSON.stringify(txn.base)
		const after = JSON.stringify(value)
		if (before === after) return

		setHistory((h) => ({
			past: [...h.past.slice(-199), txn.base],
			future: [],
		}))
	}

	async function copySelected() {
		if (!selected) return
		const node = cloneJson(selected.node) as ThreadRenderTreeNode
		setCopiedNode(node)
		try {
			await navigator.clipboard?.writeText(JSON.stringify(node))
		} catch {
			// ignore
		}
	}

	function pasteCopied() {
		if (!sceneRoot || !selected) return
		const node = copiedNode
			? (cloneJson(copiedNode) as ThreadRenderTreeNode)
			: null
		if (!node) return

		const selectedNodeNow = getNodeAtPath(sceneRoot, selected.path)
		if (!selectedNodeNow) return

		if (isContainerNode(selectedNodeNow)) {
			const idx = selectedNodeNow.children?.length ?? 0
			const next = appendChild(sceneRoot, selected.path, node)
			updateSceneRoot(next)
			setSelectedKey(
				pathKey(
					scene,
					pathForSlot(selected.path, { kind: 'children', index: idx }),
				),
			)
			return
		}

		if (selected.parentSlot?.kind === 'children' && selected.parentKey) {
			const parent = itemByKey.get(selected.parentKey)
			if (!parent) return
			const idx = selected.parentSlot.index + 1
			const next = insertChildAt(sceneRoot, parent.path, idx, node)
			updateSceneRoot(next)
			setSelectedKey(
				pathKey(
					scene,
					pathForSlot(parent.path, { kind: 'children', index: idx }),
				),
			)
			return
		}

		updateSelected(() => node)
	}

	function quickAddChildByKey(key: string) {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		const node = getNodeAtPath(sceneRoot, it.path)
		if (!node || !isContainerNode(node)) return
		const idx = node.children?.length ?? 0
		const child = createNodeToAdd()
		const next = appendChild(sceneRoot, it.path, child)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(scene, pathForSlot(it.path, { kind: 'children', index: idx })),
		)
	}

	function quickDuplicateByKey(key: string) {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		if (it.parentSlot?.kind !== 'children') return
		if (!it.parentKey) return
		const parent = itemByKey.get(it.parentKey)
		if (!parent) return
		const idx = it.parentSlot.index + 1
		const dup = cloneJson(it.node) as ThreadRenderTreeNode
		const next = insertChildAt(sceneRoot, parent.path, idx, dup)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(
				scene,
				pathForSlot(parent.path, { kind: 'children', index: idx }),
			),
		)
	}

	function quickDeleteByKey(key: string) {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		if (!it.parentKey || !it.parentSlot) return
		const parent = itemByKey.get(it.parentKey)
		if (!parent) return
		const next = removeFromParent(sceneRoot, parent.path, it.parentSlot)
		updateSceneRoot(next)
		setSelectedKey(pathKey(scene, parent.path))
	}

	function quickInsertSiblingByKey(key: string, where: 'before' | 'after') {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		if (it.parentSlot?.kind !== 'children') return
		if (!it.parentKey) return
		const parent = itemByKey.get(it.parentKey)
		if (!parent) return
		const idx =
			where === 'before' ? it.parentSlot.index : it.parentSlot.index + 1
		const child = createNodeToAdd()
		const next = insertChildAt(sceneRoot, parent.path, idx, child)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(
				scene,
				pathForSlot(parent.path, { kind: 'children', index: idx }),
			),
		)
	}

	function quickMoveByKey(key: string, dir: 'up' | 'down') {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		if (it.parentSlot?.kind !== 'children') return
		if (!it.parentKey) return
		const parent = itemByKey.get(it.parentKey)
		if (!parent || !isContainerNode(parent.node)) return
		const a = it.parentSlot.index
		const b = dir === 'up' ? a - 1 : a + 1
		if (b < 0) return
		if (b > (parent.node.children?.length ?? 0) - 1) return
		const next = swapSiblings(sceneRoot, parent.path, a, b)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(scene, pathForSlot(parent.path, { kind: 'children', index: b })),
		)
	}

	async function copyByKey(key: string) {
		const it = itemByKey.get(key)
		if (!it) return
		const node = cloneJson(it.node) as ThreadRenderTreeNode
		setCopiedNode(node)
		try {
			await navigator.clipboard?.writeText(JSON.stringify(node))
		} catch {
			// ignore
		}
	}

	function pasteByKey(key: string) {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		const node = copiedNode
			? (cloneJson(copiedNode) as ThreadRenderTreeNode)
			: null
		if (!node) return

		const targetNow = getNodeAtPath(sceneRoot, it.path)
		if (!targetNow) return

		if (isContainerNode(targetNow)) {
			const idx = targetNow.children?.length ?? 0
			const next = appendChild(sceneRoot, it.path, node)
			updateSceneRoot(next)
			setSelectedKey(
				pathKey(scene, pathForSlot(it.path, { kind: 'children', index: idx })),
			)
			return
		}

		if (it.parentSlot?.kind === 'children' && it.parentKey) {
			const parent = itemByKey.get(it.parentKey)
			if (!parent) return
			const idx = it.parentSlot.index + 1
			const next = insertChildAt(sceneRoot, parent.path, idx, node)
			updateSceneRoot(next)
			setSelectedKey(
				pathKey(
					scene,
					pathForSlot(parent.path, { kind: 'children', index: idx }),
				),
			)
			return
		}

		const next = updateNodeAtPath(sceneRoot, it.path, () => node)
		updateSceneRoot(next)
		setSelectedKey(it.key)
	}

	function wrapByKey(key: string, wrap: 'Box' | 'Stack') {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		const next = updateNodeAtPath(sceneRoot, it.path, (n) => {
			if (wrap === 'Stack')
				return {
					type: 'Stack',
					direction: 'column',
					gap: 12,
					children: [n],
				}
			return { type: 'Box', padding: 12, children: [n] }
		})
		updateSceneRoot(next)
		setSelectedKey(it.key)
	}

	function unwrapByKey(key: string) {
		if (!sceneRoot) return
		const it = itemByKey.get(key)
		if (!it) return
		const node = getNodeAtPath(sceneRoot, it.path)
		if (!node || !isContainerNode(node)) return
		const children = node.children ?? []
		if (children.length !== 1) return
		const only = children[0]
		if (!only) return
		const next = updateNodeAtPath(sceneRoot, it.path, () => only)
		updateSceneRoot(next)
		setSelectedKey(it.key)
	}

	function duplicateSelected() {
		if (!sceneRoot || !selected) return
		if (selected.parentSlot?.kind !== 'children') return
		if (!selected.parentKey) return
		const parent = itemByKey.get(selected.parentKey)
		if (!parent) return
		const idx = selected.parentSlot.index + 1
		const dup = cloneJson(selected.node) as ThreadRenderTreeNode
		const next = insertChildAt(sceneRoot, parent.path, idx, dup)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(
				scene,
				pathForSlot(parent.path, { kind: 'children', index: idx }),
			),
		)
	}

	function moveSelected(dir: 'up' | 'down') {
		if (!sceneRoot || !selected) return
		if (selected.parentSlot?.kind !== 'children') return
		if (!selected.parentKey) return
		const parent = itemByKey.get(selected.parentKey)
		if (!parent) return
		const a = selected.parentSlot.index
		const b = dir === 'up' ? a - 1 : a + 1
		const next = swapSiblings(sceneRoot, parent.path, a, b)
		updateSceneRoot(next)
		setSelectedKey(
			pathKey(scene, pathForSlot(parent.path, { kind: 'children', index: b })),
		)
	}

	const numberField = (
		label: string,
		value: unknown,
		onCommit: (next: number | undefined) => void,
		opts?: { min?: number; max?: number; step?: number },
	) => {
		const v =
			typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
		return (
			<div className="space-y-1">
				<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					{label}
				</Label>
				<Input
					type="number"
					inputMode="numeric"
					min={opts?.min}
					max={opts?.max}
					step={opts?.step}
					value={v}
					onFocus={() => beginTxn()}
					onBlur={() => endTxn()}
					onKeyDown={(e) => {
						if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
					}}
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

	const textField = (
		label: string,
		value: unknown,
		onCommit: (next: string | undefined) => void,
		opts?: { placeholder?: string },
	) => {
		const v = typeof value === 'string' ? value : ''
		return (
			<div className="space-y-1">
				<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					{label}
				</Label>
				<Input
					value={v}
					placeholder={opts?.placeholder}
					onFocus={() => beginTxn()}
					onBlur={() => endTxn()}
					onKeyDown={(e) => {
						if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
					}}
					onChange={(e) => {
						const t = e.target.value
						onCommit(t.trim() ? t : undefined)
					}}
					className="rounded-none font-mono text-xs h-8"
				/>
			</div>
		)
	}

	const boolField = (
		label: string,
		value: unknown,
		onCommit: (next: boolean | undefined) => void,
	) => {
		const checked = typeof value === 'boolean' ? value : false
		return (
			<div className="flex items-center justify-between gap-3 rounded-none border border-border px-3 py-2">
				<div className="font-mono text-xs text-foreground">{label}</div>
				<Switch checked={checked} onCheckedChange={(v) => onCommit(v)} />
			</div>
		)
	}

	const selectField = (
		label: string,
		value: unknown,
		options: Array<{ value: string; label?: string }>,
		onCommit: (next: string | undefined) => void,
	) => {
		const missingFieldPrefix = 'ThreadTemplates.visualEditor.fields.'
		const missingOptionPrefix = 'ThreadTemplates.visualEditor.options.'

		const fieldLabel = (() => {
			const translated = t(`fields.${label}`)
			return translated.startsWith(missingFieldPrefix) ? label : translated
		})()

		const getOptionLabel = (opt: { value: string; label?: string }) => {
			if (opt.label) return opt.label
			const translated = t(`options.${opt.value}`)
			return translated.startsWith(missingOptionPrefix) ? opt.value : translated
		}

		const v = typeof value === 'string' && value ? value : '__none__'
		return (
			<Select
				value={v}
				onValueChange={(next) =>
					onCommit(next === '__none__' ? undefined : next)
				}
			>
				<div className="space-y-1">
					<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						{fieldLabel}
					</Label>
					<SelectTrigger className="rounded-none font-mono text-xs h-8">
						<SelectValue />
					</SelectTrigger>
				</div>
				<SelectContent>
					<SelectItem value="__none__">{t('options.none')}</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{getOptionLabel(o)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		)
	}

	const selectedNode = selected?.node ?? null
	const baselineSelectedNode =
		selected && baselineSceneRoot
			? getNodeAtPath(baselineSceneRoot, selected.path)
			: null

	const canResetSelectedToBaseline = React.useMemo(() => {
		if (!baselineSelectedNode || !selectedNode) return false
		return JSON.stringify(baselineSelectedNode) !== JSON.stringify(selectedNode)
	}, [baselineSelectedNode, selectedNode])
	const canUndo = history.past.length > 0
	const canRedo = history.future.length > 0

	const actionsParent = actionsItem?.parentKey
		? (itemByKey.get(actionsItem.parentKey) ?? null)
		: null
	const canActionsAddChild = Boolean(
		actionsItem && isContainerNode(actionsItem.node),
	)
	const canActionsInsertSibling = Boolean(
		actionsItem?.parentSlot?.kind === 'children' && actionsParent,
	)
	const canActionsDuplicate = Boolean(
		actionsItem?.parentSlot?.kind === 'children',
	)
	const canActionsDelete = Boolean(
		actionsItem?.parentKey && actionsItem?.parentSlot,
	)
	const canActionsMoveUp = Boolean(
		actionsItem?.parentSlot?.kind === 'children' &&
		(actionsItem.parentSlot?.index ?? 0) > 0,
	)
	const canActionsMoveDown = Boolean(
		actionsItem?.parentSlot?.kind === 'children' &&
		actionsParent &&
		isContainerNode(actionsParent.node) &&
		(actionsItem.parentSlot?.index ?? 0) <
			(actionsParent.node.children?.length ?? 0) - 1,
	)
	const canActionsUnwrap = Boolean(
		actionsItem &&
		isContainerNode(actionsItem.node) &&
		(actionsItem.node.children?.length ?? 0) === 1,
	)
	const canActionsPaste = Boolean(actionsItem && copiedNode)

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

	const canCollapseStructure = Boolean(onStructureCollapsedChange)
	const canCollapseInspector = Boolean(onPropertiesCollapsedChange)
	const isStructureCollapsed =
		Boolean(structureCollapsed) && canCollapseStructure
	const isPropertiesCollapsed =
		Boolean(propertiesCollapsed) && canCollapseInspector

	return (
		<div
			className={
				layout === 'panels'
					? 'contents'
					: 'grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]'
			}
			onKeyDownCapture={(e) => {
				if (!hotkeysEnabled) return
				if (isTypingTarget(e.target)) return

				if (e.altKey && e.key === 'ArrowUp') {
					e.preventDefault()
					moveSelected('up')
					return
				}
				if (e.altKey && e.key === 'ArrowDown') {
					e.preventDefault()
					moveSelected('down')
					return
				}

				const key = e.key.toLowerCase()
				const mod = e.metaKey || e.ctrlKey
				if (!mod) return

				if (key === 'z' && !e.shiftKey) {
					e.preventDefault()
					undo()
					return
				}
				if (key === 'z' && e.shiftKey) {
					e.preventDefault()
					redo()
					return
				}
				if (key === 'y') {
					e.preventDefault()
					redo()
					return
				}
				if (key === 'c') {
					e.preventDefault()
					void copySelected()
					return
				}
				if (key === 'v') {
					e.preventDefault()
					pasteCopied()
					return
				}
				if (key === 'd') {
					e.preventDefault()
					duplicateSelected()
					return
				}
				if (key === 'f') {
					e.preventDefault()
					treeFilterInputRef.current?.focus()
					treeFilterInputRef.current?.select()
					return
				}
				if (key === 'k') {
					e.preventDefault()
					setJumpOpen(true)
					return
				}
			}}
		>
			<Dialog
				open={jumpOpen}
				onOpenChange={(open) => {
					setJumpOpen(open)
					if (!open) setJumpQuery('')
				}}
			>
				<DialogContent className="rounded-none sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="font-mono uppercase tracking-widest text-sm">
							{t('structure.jumpDialogTitle')}
						</DialogTitle>
						<DialogDescription className="font-mono text-xs">
							{t('structure.jumpDialogDescription')}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-2">
						<Input
							ref={jumpInputRef}
							value={jumpQuery}
							onChange={(e) => setJumpQuery(e.target.value)}
							placeholder={t('structure.jumpDialogPlaceholder')}
							className="rounded-none font-mono text-xs h-9"
							onKeyDown={(e) => {
								if (e.key === 'Escape') {
									e.preventDefault()
									setJumpOpen(false)
									return
								}
								if (e.key === 'Enter') {
									const first = jumpResults[0]
									if (!first) return
									e.preventDefault()
									selectJumpResult(first)
								}
							}}
						/>

						<div className="rounded-none border border-border bg-card">
							<div className="max-h-[340px] overflow-auto py-1">
								{jumpQuery.trim() ? (
									jumpResults.length > 0 ? (
										jumpResults.map((it) => (
											<button
												key={it.key}
												type="button"
												className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs hover:bg-muted"
												title={it.key}
												onClick={() => selectJumpResult(it)}
											>
												<span className="shrink-0 text-muted-foreground">
													{it.scene === 'cover'
														? t('structure.cover')
														: t('structure.post')}
												</span>
												<span className="min-w-0 flex-1 truncate text-foreground">
													{it.label}
												</span>
												<span className="shrink-0 text-muted-foreground">
													{it.key.slice(0, 12)}
												</span>
											</button>
										))
									) : (
										<div className="px-3 py-2 font-mono text-xs text-muted-foreground">
											{t('structure.jumpDialogNoResults')}
										</div>
									)
								) : (
									<div className="px-3 py-2 font-mono text-xs text-muted-foreground">
										{t('structure.jumpDialogTypeToSearch')}
									</div>
								)}
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(actionsItem)}
				onOpenChange={(open) => {
					if (open) return
					setActionsKey(null)
				}}
			>
				<DialogContent className="rounded-none sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="font-mono uppercase tracking-widest text-sm">
							{t('structure.actionsDialogTitle')}
						</DialogTitle>
						<DialogDescription className="font-mono text-xs">
							{t('structure.actionsDialogDescription')}
						</DialogDescription>
					</DialogHeader>

					{actionsItem ? (
						<div className="space-y-3">
							<div className="rounded-none border border-border bg-card px-3 py-2">
								<div className="font-mono text-xs text-foreground">
									{actionsItem.label}
								</div>
								<div className="font-mono text-[10px] text-muted-foreground">
									{actionsItem.key}
								</div>
							</div>

							<div className="space-y-1">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('structure.newNodeType')}
								</Label>
								<Select
									value={addType}
									onValueChange={(v) =>
										setAddType(v as ThreadRenderTreeNode['type'])
									}
								>
									<SelectTrigger className="rounded-none font-mono text-xs h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ADD_NODE_TYPES.map((t) => (
											<SelectItem key={t} value={t}>
												{t}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsAddChild}
									onClick={() => {
										quickAddChildByKey(actionsItem.key)
										setActionsKey(null)
									}}
								>
									{t('structure.addChild')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsInsertSibling}
									onClick={() => {
										quickInsertSiblingByKey(actionsItem.key, 'before')
										setActionsKey(null)
									}}
								>
									{t('structure.insertBefore')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsInsertSibling}
									onClick={() => {
										quickInsertSiblingByKey(actionsItem.key, 'after')
										setActionsKey(null)
									}}
								>
									{t('structure.insertAfter')}
								</Button>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									onClick={() => void copyByKey(actionsItem.key)}
								>
									{t('structure.copy')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsPaste}
									onClick={() => {
										pasteByKey(actionsItem.key)
										setActionsKey(null)
									}}
								>
									{t('structure.paste')}
								</Button>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsMoveUp}
									onClick={() => {
										quickMoveByKey(actionsItem.key, 'up')
										setActionsKey(null)
									}}
								>
									{t('structure.moveUp')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsMoveDown}
									onClick={() => {
										quickMoveByKey(actionsItem.key, 'down')
										setActionsKey(null)
									}}
								>
									{t('structure.moveDown')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsDuplicate}
									onClick={() => {
										quickDuplicateByKey(actionsItem.key)
										setActionsKey(null)
									}}
								>
									{t('structure.duplicate')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsDelete}
									onClick={() => {
										quickDeleteByKey(actionsItem.key)
										setActionsKey(null)
									}}
								>
									{t('structure.delete')}
								</Button>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									onClick={() => {
										wrapByKey(actionsItem.key, 'Box')
										setActionsKey(null)
									}}
								>
									{t('structure.wrapBox')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									onClick={() => {
										wrapByKey(actionsItem.key, 'Stack')
										setActionsKey(null)
									}}
								>
									{t('structure.wrapStack')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canActionsUnwrap}
									onClick={() => {
										unwrapByKey(actionsItem.key)
										setActionsKey(null)
									}}
								>
									{t('structure.unwrap')}
								</Button>
							</div>
						</div>
					) : null}
				</DialogContent>
			</Dialog>

			<div
				className={[
					isStructureCollapsed ? 'h-full' : 'space-y-3',
					structureClassName,
				]
					.filter(Boolean)
					.join(' ')}
			>
				{isStructureCollapsed ? (
					<div className="flex h-full flex-col items-center justify-start gap-3 rounded-none border border-border bg-card py-3">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="rounded-none font-mono text-[10px] uppercase"
							onClick={() => onStructureCollapsedChange?.(false)}
						>
							{t('structure.expand')}
						</Button>
						<div
							className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
							style={{ writingMode: 'vertical-rl' }}
						>
							{t('structure.title')}
						</div>
					</div>
				) : (
					<>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('structure.title')}
								</div>
								{canCollapseStructure ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase"
										onClick={() => onStructureCollapsedChange?.(true)}
									>
										{t('structure.collapse')}
									</Button>
								) : null}
							</div>
							<div className="flex items-center gap-2">
								{showSceneToggle ? (
									<>
										<Button
											type="button"
											size="sm"
											variant={scene === 'cover' ? 'default' : 'outline'}
											className="rounded-none font-mono text-[10px] uppercase"
											onClick={() => {
												setScene('cover')
												setSelectedKey(pathKey('cover', []))
											}}
										>
											{t('structure.cover')}
										</Button>
										<Button
											type="button"
											size="sm"
											variant={scene === 'post' ? 'default' : 'outline'}
											className="rounded-none font-mono text-[10px] uppercase"
											onClick={() => {
												setScene('post')
												setSelectedKey(pathKey('post', []))
											}}
										>
											{t('structure.post')}
										</Button>
									</>
								) : null}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<Input
								ref={treeFilterInputRef}
								placeholder={t('structure.searchPlaceholder')}
								value={treeFilter}
								onChange={(e) => setTreeFilter(e.target.value)}
								className="rounded-none font-mono text-xs h-8"
							/>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="rounded-none font-mono text-xs h-8 px-2"
								title={t('structure.jumpTitle')}
								onClick={() => setJumpOpen(true)}
							>
								<Search className="size-3" />
								<span className="ml-1">{t('structure.jump')}</span>
							</Button>
						</div>

						<div className="font-mono text-[10px] text-muted-foreground">
							{t('structure.searchHint')}
						</div>

						<div className="rounded-none border border-border bg-card">
							<div className="max-h-[420px] overflow-auto py-2">
								<TreeView
									items={tree}
									childrenByKey={childrenByKey}
									parentByKey={parentByKey}
									selectedKey={selectedKey}
									onSelectedKeyChange={setSelectedKey}
									filterText={treeFilter}
									state={treeState}
									onStateChange={setTreeState}
									onQuickAddChild={quickAddChildByKey}
									onQuickDuplicate={quickDuplicateByKey}
									onQuickDelete={quickDeleteByKey}
									onOpenActions={(key) => {
										setSelectedKey(key)
										setActionsKey(key)
									}}
									t={t}
								/>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Select
								value={addType}
								onValueChange={(v) => setAddType(v as any)}
							>
								<SelectTrigger className="rounded-none font-mono text-xs h-9">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ADD_NODE_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{t}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Button
								type="button"
								size="sm"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!canUndo}
								onClick={undo}
							>
								{t('structure.undo')}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!canRedo}
								onClick={redo}
							>
								{t('structure.redo')}
							</Button>
						</div>
					</>
				)}
			</div>

			<div
				className={[
					isPropertiesCollapsed ? 'h-full' : 'space-y-3',
					propertiesClassName,
				]
					.filter(Boolean)
					.join(' ')}
			>
				{isPropertiesCollapsed ? (
					<div className="flex h-full flex-col items-center justify-start gap-3 rounded-none border border-border bg-card py-3">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="rounded-none font-mono text-[10px] uppercase"
							onClick={() => onPropertiesCollapsedChange?.(false)}
						>
							{t('inspector.expand')}
						</Button>
						<div
							className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
							style={{ writingMode: 'vertical-rl' }}
						>
							{t('inspector.title')}
						</div>
					</div>
				) : (
					<>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('inspector.title')}
								</div>
								{canCollapseInspector ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase"
										onClick={() => onPropertiesCollapsedChange?.(true)}
									>
										{t('inspector.collapse')}
									</Button>
								) : null}
							</div>
						</div>

						<div className="rounded-none border border-border bg-card p-4 space-y-4">
							{!selectedNode ? (
								<div className="font-mono text-xs text-muted-foreground">
									{t('inspector.selectNodeHint')}
								</div>
							) : (
								<>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<div className="font-mono text-xs text-foreground">
												{selectedNode.type}
											</div>
											{baselineValue && canResetSelectedToBaseline ? (
												<div className="rounded-none border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground">
													{t('inspector.modified')}
												</div>
											) : null}
										</div>
										<div className="flex items-center gap-2">
											{baselineValue ? (
												<Button
													type="button"
													size="sm"
													variant="outline"
													className="rounded-none font-mono text-[10px] uppercase"
													disabled={!canResetSelectedToBaseline}
													title={t('inspector.resetToBaselineTitle')}
													onClick={() => {
														if (!baselineSelectedNode) return
														updateSelected(() =>
															cloneJson(baselineSelectedNode),
														)
													}}
												>
													{t('inspector.reset')}
												</Button>
											) : null}
											<div className="font-mono text-[10px] text-muted-foreground">
												{scene}
											</div>
										</div>
									</div>

									{selectedNode.type === 'Text' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{textField(
												t('fields.text'),
												selectedNode.text,
												(v) =>
													updateSelected((n) => ({ ...(n as any), text: v })),
												{ placeholder: t('placeholders.text') },
											)}
											<Select
												value={selectedNode.bind ?? '__none__'}
												onValueChange={(v) =>
													updateSelected((n) => ({
														...(n as any),
														bind: v === '__none__' ? undefined : v,
													}))
												}
											>
												<div className="space-y-1">
													<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
														{t('fields.bind')}
													</Label>
													<SelectTrigger className="rounded-none font-mono text-xs h-8">
														<SelectValue />
													</SelectTrigger>
												</div>
												<SelectContent>
													<SelectItem value="__none__">
														{t('options.none')}
													</SelectItem>
													{(
														[
															'thread.title',
															'thread.source',
															'thread.sourceUrl',
															'timeline.replyIndicator',
															'timeline.replyIndex',
															'timeline.replyCount',
															'root.author.name',
															'root.author.handle',
															'root.plainText',
															'root.translations.zh-CN.plainText',
															'post.author.name',
															'post.author.handle',
															'post.plainText',
															'post.translations.zh-CN.plainText',
														] as const
													).map((b) => (
														<SelectItem key={b} value={b}>
															{b}
														</SelectItem>
													))}
												</SelectContent>
											</Select>

											{numberField(
												t('fields.size'),
												selectedNode.size,
												(v) =>
													updateSelected((n) => ({ ...(n as any), size: v })),
												{ min: 8, max: 120, step: 1 },
											)}
											{numberField(
												t('fields.weight'),
												selectedNode.weight,
												(v) =>
													updateSelected((n) => ({ ...(n as any), weight: v })),
												{ min: 100, max: 900, step: 100 },
											)}
											{numberField(
												t('fields.opacity'),
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
											{numberField(
												t('fields.maxLines'),
												selectedNode.maxLines,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														maxLines: v,
													})),
												{ min: 1, max: 20, step: 1 },
											)}
											<Select
												value={selectedNode.align ?? '__none__'}
												onValueChange={(v) =>
													updateSelected((n) => ({
														...(n as any),
														align: v === '__none__' ? undefined : v,
													}))
												}
											>
												<div className="space-y-1">
													<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
														{t('fields.align')}
													</Label>
													<SelectTrigger className="rounded-none font-mono text-xs h-8">
														<SelectValue />
													</SelectTrigger>
												</div>
												<SelectContent>
													<SelectItem value="__none__">
														{t('options.none')}
													</SelectItem>
													{(['left', 'center', 'right'] as const).map((a) => (
														<SelectItem key={a} value={a}>
															{t(`options.${a}`)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{selectField(
												t('fields.color'),
												(selectedNode as any).color,
												[
													{ value: 'primary' },
													{ value: 'muted' },
													{ value: 'accent' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), color: v })),
											)}
											{numberField(
												t('fields.lineHeight'),
												(selectedNode as any).lineHeight,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														lineHeight: v,
													})),
												{ min: 0.8, max: 3, step: 0.05 },
											)}
											{numberField(
												t('fields.letterSpacing'),
												(selectedNode as any).letterSpacing,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														letterSpacing: v,
													})),
												{ min: -2, max: 20, step: 0.1 },
											)}
											{boolField(
												t('fields.uppercase'),
												(selectedNode as any).uppercase,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														uppercase: v,
													})),
											)}
										</div>
									) : null}

									{selectedNode.type === 'Metrics' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{selectField(
												'bind',
												(selectedNode as any).bind,
												[
													{ value: 'post.metrics.likes' },
													{ value: 'root.metrics.likes' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), bind: v })),
											)}
											{selectField(
												'color',
												(selectedNode as any).color,
												[
													{ value: 'primary' },
													{ value: 'muted' },
													{ value: 'accent' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), color: v })),
											)}
											{numberField(
												'size',
												(selectedNode as any).size,
												(v) =>
													updateSelected((n) => ({ ...(n as any), size: v })),
												{ min: 10, max: 64, step: 1 },
											)}
											{numberField(
												'opacity',
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
											{boolField(
												'showIcon',
												(selectedNode as any).showIcon,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														showIcon: v,
													})),
											)}
										</div>
									) : null}

									{selectedNode.type === 'Avatar' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{selectField(
												'bind',
												(selectedNode as any).bind,
												[
													{ value: 'root.author.avatarAssetId' },
													{ value: 'post.author.avatarAssetId' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), bind: v })),
											)}
											{textField(
												'background',
												(selectedNode as any).background,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														background: v,
													})),
												{ placeholder: 'rgba(...) or var(--tf-...)' },
											)}
											{boolField('border', (selectedNode as any).border, (v) =>
												updateSelected((n) => ({ ...(n as any), border: v })),
											)}
											{numberField(
												'size',
												(selectedNode as any).size,
												(v) =>
													updateSelected((n) => ({ ...(n as any), size: v })),
												{ min: 24, max: 240, step: 1 },
											)}
											{numberField(
												'radius',
												(selectedNode as any).radius,
												(v) =>
													updateSelected((n) => ({ ...(n as any), radius: v })),
												{ min: 0, max: 999, step: 1 },
											)}
											{numberField(
												'opacity',
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
										</div>
									) : null}

									{selectedNode.type === 'ContentBlocks' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{selectField(
												'bind',
												(selectedNode as any).bind,
												[
													{ value: 'post.contentBlocks' },
													{ value: 'root.contentBlocks' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), bind: v })),
											)}
											{numberField(
												'gap',
												(selectedNode as any).gap,
												(v) =>
													updateSelected((n) => ({ ...(n as any), gap: v })),
												{ min: 0, max: 80, step: 1 },
											)}
											{numberField(
												'maxHeight',
												(selectedNode as any).maxHeight,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														maxHeight: v,
													})),
												{ min: 100, max: 1200, step: 1 },
											)}
											{numberField(
												'opacity',
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
										</div>
									) : null}

									{selectedNode.type === 'Stack' ||
									selectedNode.type === 'Box' ||
									selectedNode.type === 'Grid' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{numberField(
												'flex',
												(selectedNode as any).flex,
												(v) =>
													updateSelected((n) => ({ ...(n as any), flex: v })),
												{ min: 0, max: 100, step: 1 },
											)}
											{numberField(
												'opacity',
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
											{numberField(
												'gap',
												(selectedNode as any).gap,
												(v) =>
													updateSelected((n) => ({ ...(n as any), gap: v })),
												{ min: 0, max: 240, step: 1 },
											)}
											{numberField(
												'gapX',
												(selectedNode as any).gapX,
												(v) =>
													updateSelected((n) => ({ ...(n as any), gapX: v })),
												{ min: 0, max: 240, step: 1 },
											)}
											{numberField(
												'gapY',
												(selectedNode as any).gapY,
												(v) =>
													updateSelected((n) => ({ ...(n as any), gapY: v })),
												{ min: 0, max: 240, step: 1 },
											)}
											{numberField(
												'padding',
												(selectedNode as any).padding,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														padding: v,
													})),
												{ min: 0, max: 240, step: 1 },
											)}
											{numberField(
												'paddingX',
												(selectedNode as any).paddingX,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														paddingX: v,
													})),
												{ min: 0, max: 240, step: 1 },
											)}
											{numberField(
												'paddingY',
												(selectedNode as any).paddingY,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														paddingY: v,
													})),
												{ min: 0, max: 240, step: 1 },
											)}
											{textField(
												'background',
												(selectedNode as any).background,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														background: v,
													})),
												{ placeholder: 'rgba(...) or var(--tf-...)' },
											)}
											{numberField(
												'radius',
												(selectedNode as any).radius,
												(v) =>
													updateSelected((n) => ({ ...(n as any), radius: v })),
												{ min: 0, max: 120, step: 1 },
											)}
											{boolField('border', (selectedNode as any).border, (v) =>
												updateSelected((n) => ({ ...(n as any), border: v })),
											)}
											{selectField(
												'overflow',
												(selectedNode as any).overflow,
												[{ value: 'hidden' }],
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														overflow: v,
													})),
											)}
											{numberField(
												'width',
												(selectedNode as any).width,
												(v) =>
													updateSelected((n) => ({ ...(n as any), width: v })),
												{ min: 0, max: 2000, step: 1 },
											)}
											{numberField(
												'height',
												(selectedNode as any).height,
												(v) =>
													updateSelected((n) => ({ ...(n as any), height: v })),
												{ min: 0, max: 2000, step: 1 },
											)}
											{numberField(
												'maxWidth',
												(selectedNode as any).maxWidth,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														maxWidth: v,
													})),
												{ min: 0, max: 2000, step: 1 },
											)}
											{numberField(
												'maxHeight',
												(selectedNode as any).maxHeight,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														maxHeight: v,
													})),
												{ min: 0, max: 2000, step: 1 },
											)}
											{selectedNode.type === 'Grid'
												? numberField(
														'columns',
														(selectedNode as any).columns,
														(v) =>
															updateSelected((n) => ({
																...(n as any),
																columns: v,
															})),
														{ min: 1, max: 12, step: 1 },
													)
												: null}
											{selectedNode.type === 'Stack' ? (
												<Select
													value={(selectedNode as any).direction ?? 'column'}
													onValueChange={(v) =>
														updateSelected((n) => ({
															...(n as any),
															direction: v,
														}))
													}
												>
													<div className="space-y-1">
														<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
															{t('fields.direction')}
														</Label>
														<SelectTrigger className="rounded-none font-mono text-xs h-8">
															<SelectValue />
														</SelectTrigger>
													</div>
													<SelectContent>
														<SelectItem value="column">
															{t('options.column')}
														</SelectItem>
														<SelectItem value="row">
															{t('options.row')}
														</SelectItem>
													</SelectContent>
												</Select>
											) : null}
											{selectedNode.type === 'Stack'
												? selectField(
														'align',
														(selectedNode as any).align,
														[
															{ value: 'start' },
															{ value: 'center' },
															{ value: 'end' },
															{ value: 'stretch' },
														],
														(v) =>
															updateSelected((n) => ({
																...(n as any),
																align: v,
															})),
													)
												: null}
											{selectedNode.type === 'Stack'
												? selectField(
														'justify',
														(selectedNode as any).justify,
														[
															{ value: 'start' },
															{ value: 'center' },
															{ value: 'end' },
															{ value: 'between' },
														],
														(v) =>
															updateSelected((n) => ({
																...(n as any),
																justify: v,
															})),
													)
												: null}
											{selectedNode.type === 'Grid'
												? selectField(
														'align',
														(selectedNode as any).align,
														[
															{ value: 'start' },
															{ value: 'center' },
															{ value: 'end' },
															{ value: 'stretch' },
														],
														(v) =>
															updateSelected((n) => ({
																...(n as any),
																align: v,
															})),
													)
												: null}
											{selectedNode.type === 'Grid'
												? selectField(
														'justify',
														(selectedNode as any).justify,
														[
															{ value: 'start' },
															{ value: 'center' },
															{ value: 'end' },
															{ value: 'stretch' },
														],
														(v) =>
															updateSelected((n) => ({
																...(n as any),
																justify: v,
															})),
													)
												: null}
										</div>
									) : null}

									{selectedNode.type === 'Image' ||
									selectedNode.type === 'Video' ? (
										<div className="space-y-3">
											<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
												{textField('assetId', selectedNode.assetId, (v) =>
													updateSelected((n) => ({
														...(n as any),
														assetId: v ?? '',
													})),
												)}
												<Select
													value="__pick__"
													onValueChange={(v) => {
														if (!v || v === '__pick__') return
														updateSelected((n) => ({
															...(n as any),
															assetId: v,
														}))
													}}
												>
													<div className="space-y-1">
														<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
															Pick Asset
														</Label>
														<SelectTrigger className="rounded-none font-mono text-xs h-8">
															<SelectValue
																placeholder={t('placeholders.select')}
															/>
														</SelectTrigger>
													</div>
													<SelectContent>
														<SelectItem value="__pick__">
															{t('placeholders.select')}
														</SelectItem>
														{pickableAssets
															.filter((a) =>
																selectedNode.type === 'Image'
																	? a.kind === 'image'
																	: a.kind === 'video',
															)
															.slice(0, 50)
															.map((a) => (
																<SelectItem key={a.id} value={a.id}>
																	{a.id}
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											</div>

											<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
												{selectField(
													'fit',
													(selectedNode as any).fit,
													[{ value: 'cover' }, { value: 'contain' }],
													(v) =>
														updateSelected((n) => ({ ...(n as any), fit: v })),
												)}
												{textField(
													'position',
													(selectedNode as any).position,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															position: v,
														})),
													{ placeholder: 'e.g. 50% 50%' },
												)}
												{numberField(
													'width',
													(selectedNode as any).width,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															width: v,
														})),
													{ min: 16, max: 1600, step: 1 },
												)}
												{numberField(
													'height',
													(selectedNode as any).height,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															height: v,
														})),
													{ min: 16, max: 1600, step: 1 },
												)}
												{numberField(
													'blur',
													(selectedNode as any).blur,
													(v) =>
														updateSelected((n) => ({ ...(n as any), blur: v })),
													{ min: 0, max: 80, step: 1 },
												)}
												{textField(
													t('fields.background'),
													(selectedNode as any).background,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															background: v,
														})),
													{ placeholder: t('placeholders.color') },
												)}
												{numberField(
													'radius',
													(selectedNode as any).radius,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															radius: v,
														})),
													{ min: 0, max: 120, step: 1 },
												)}
												{numberField(
													'borderWidth',
													(selectedNode as any).borderWidth,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															borderWidth: v,
														})),
													{ min: 0, max: 24, step: 1 },
												)}
												{selectField(
													'borderColor',
													(selectedNode as any).borderColor,
													[
														{ value: 'border' },
														{ value: 'primary' },
														{ value: 'muted' },
														{ value: 'accent' },
													],
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															borderColor: v,
														})),
												)}
												{boolField(
													'border',
													(selectedNode as any).border,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															border: v,
														})),
												)}
												{numberField(
													'opacity',
													(selectedNode as any).opacity,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															opacity: v,
														})),
													{ min: 0, max: 1, step: 0.05 },
												)}
											</div>
										</div>
									) : null}

									{selectedNode.type === 'Background' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{textField('color', selectedNode.color, (v) =>
												updateSelected((n) => ({ ...(n as any), color: v })),
											)}
											{textField('assetId', selectedNode.assetId, (v) =>
												updateSelected((n) => ({ ...(n as any), assetId: v })),
											)}
											<Select
												value="__pick__"
												onValueChange={(v) => {
													if (!v || v === '__pick__') return
													updateSelected((n) => ({ ...(n as any), assetId: v }))
												}}
											>
												<div className="space-y-1">
													<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
														{t('fields.pickAsset')}
													</Label>
													<SelectTrigger className="rounded-none font-mono text-xs h-8">
														<SelectValue placeholder="Select…" />
													</SelectTrigger>
												</div>
												<SelectContent>
													<SelectItem value="__pick__">Select…</SelectItem>
													{pickableImageAssets.slice(0, 50).map((a) => (
														<SelectItem key={a.id} value={a.id}>
															{a.id}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{numberField(
												'opacity',
												selectedNode.opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
											{numberField(
												'blur',
												selectedNode.blur,
												(v) =>
													updateSelected((n) => ({ ...(n as any), blur: v })),
												{ min: 0, max: 80, step: 1 },
											)}
										</div>
									) : null}

									{selectedNode.type === 'Absolute' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{numberField('x', selectedNode.x, (v) =>
												updateSelected((n) => ({ ...(n as any), x: v })),
											)}
											{numberField('y', selectedNode.y, (v) =>
												updateSelected((n) => ({ ...(n as any), y: v })),
											)}
											{numberField('width', selectedNode.width, (v) =>
												updateSelected((n) => ({ ...(n as any), width: v })),
											)}
											{numberField('height', selectedNode.height, (v) =>
												updateSelected((n) => ({ ...(n as any), height: v })),
											)}
											{numberField('zIndex', selectedNode.zIndex, (v) =>
												updateSelected((n) => ({ ...(n as any), zIndex: v })),
											)}
											{numberField(
												'opacity',
												(selectedNode as any).opacity,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														opacity: v,
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
											{boolField(
												'pointerEvents',
												selectedNode.pointerEvents,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														pointerEvents: v,
													})),
											)}
											{numberField('rotate', selectedNode.rotate, (v) =>
												updateSelected((n) => ({ ...(n as any), rotate: v })),
											)}
											{numberField('scale', selectedNode.scale, (v) =>
												updateSelected((n) => ({ ...(n as any), scale: v })),
											)}
											{selectField(
												'origin',
												selectedNode.origin,
												[
													{ value: 'center' },
													{ value: 'top-left' },
													{ value: 'top-right' },
													{ value: 'bottom-left' },
													{ value: 'bottom-right' },
												],
												(v) =>
													updateSelected((n) => ({ ...(n as any), origin: v })),
											)}
										</div>
										) : null}

										{selectedNode.type === 'Repeat' ? (
											<div className="space-y-3">
												<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
													{numberField(
													'maxItems',
													(selectedNode as any).maxItems,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															maxItems: v,
														})),
													{ min: 1, max: 100, step: 1 },
												)}
												{numberField('gap', (selectedNode as any).gap, (v) =>
													updateSelected((n) => ({ ...(n as any), gap: v })),
												)}
												{boolField(
													'wrapItemRoot',
													(selectedNode as any).wrapItemRoot,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															wrapItemRoot: v,
														})),
												)}
												{boolField(
													'scroll',
													(selectedNode as any).scroll,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															scroll: v,
														})),
												)}
											</div>

											<div className="space-y-2">
												<div className="flex flex-wrap items-center justify-between gap-2">
													<div className="font-mono text-xs text-muted-foreground">
														itemRoot
													</div>
													<div className="flex flex-wrap items-center gap-2">
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="rounded-none font-mono text-[10px] uppercase"
															onClick={() =>
																updateSelected((n) => ({
																	...(n as any),
																	itemRoot: createDefaultNode('Stack'),
																}))
															}
														>
															Replace
														</Button>
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="rounded-none font-mono text-[10px] uppercase"
															onClick={() => {
																if (!selected) return
																setSelectedKey(
																	pathKey(scene, [
																		...selected.path,
																		'itemRoot',
																	]),
																)
															}}
														>
															Select
														</Button>
													</div>
												</div>
												<div className="font-mono text-xs text-muted-foreground">
													{t('notes.repeatNote')}
												</div>
											</div>

											<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
												{boolField(
													'highlight.enabled',
													(selectedNode as any).highlight?.enabled,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															highlight: v
																? { ...(n as any).highlight, enabled: true }
																: undefined,
														})),
												)}
												{selectField(
													'highlight.color',
													(selectedNode as any).highlight?.color,
													[
														{ value: 'primary' },
														{ value: 'muted' },
														{ value: 'accent' },
													],
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															highlight: { ...(n as any).highlight, color: v },
														})),
												)}
												{numberField(
													'highlight.thickness',
													(selectedNode as any).highlight?.thickness,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															highlight: {
																...(n as any).highlight,
																thickness: v,
															},
														})),
													{ min: 1, max: 12, step: 1 },
												)}
												{numberField(
													'highlight.radius',
													(selectedNode as any).highlight?.radius,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															highlight: { ...(n as any).highlight, radius: v },
														})),
													{ min: 0, max: 48, step: 1 },
												)}
												{numberField(
													'highlight.opacity',
													(selectedNode as any).highlight?.opacity,
													(v) =>
														updateSelected((n) => ({
															...(n as any),
															highlight: {
																...(n as any).highlight,
																opacity: v,
															},
														})),
													{ min: 0, max: 1, step: 0.05 },
												)}
											</div>
										</div>
									) : null}
								</>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	)
}
