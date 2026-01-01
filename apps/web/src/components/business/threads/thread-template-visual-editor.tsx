'use client'

import * as React from 'react'
import type {
	ThreadRenderTreeNode,
	ThreadTemplateConfigV1,
} from '@app/remotion-project/types'
import { Button } from '~/components/ui/button'
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

type NodePath = Array<string | number>

type SceneKey = 'cover' | 'post'

type AssetRow = {
	id: string
	kind: 'image' | 'video' | 'avatar' | 'linkPreview' | 'audio' | string
	status?: string | null
}

type ParentSlot =
	| { kind: 'children'; index: number }
	| { kind: 'rootRoot' }
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
	if (node.type === 'Builtin') return `Builtin · ${node.kind}`
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

	if (node.type === 'Builtin' && node.kind === 'repliesList') {
		if (node.rootRoot)
			out.push({ slot: { kind: 'rootRoot' }, child: node.rootRoot })
		if (node.itemRoot)
			out.push({ slot: { kind: 'itemRoot' }, child: node.itemRoot })
	}

	if (node.type === 'Builtin' && node.kind === 'repliesListRootPost') {
		if (node.rootRoot)
			out.push({ slot: { kind: 'rootRoot' }, child: node.rootRoot })
	}

	if (node.type === 'Builtin' && node.kind === 'repliesListReplies') {
		if (node.itemRoot)
			out.push({ slot: { kind: 'itemRoot' }, child: node.itemRoot })
	}

	if (node.type === 'Repeat') {
		out.push({ slot: { kind: 'itemRoot' }, child: node.itemRoot })
	}

	return out
}

function pathForSlot(path: NodePath, slot: ParentSlot): NodePath {
	if (slot.kind === 'children') return [...path, 'children', slot.index]
	if (slot.kind === 'rootRoot') return [...path, 'rootRoot']
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
		if (seg === 'rootRoot' || seg === 'itemRoot') {
			cur = cur?.[seg]
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

	if (seg === 'rootRoot' || seg === 'itemRoot') {
		if (seg === 'rootRoot') {
			if (root.type !== 'Builtin') return root
			const child = (root as any)[seg] as ThreadRenderTreeNode | undefined
			if (!child) return root
			return {
				...(root as any),
				[seg]: updateNodeAtPath(child, path.slice(1), updater),
			}
		}

		if (seg === 'itemRoot') {
			if (root.type !== 'Builtin' && root.type !== 'Repeat') return root
			const child = (root as any)[seg] as ThreadRenderTreeNode | undefined
			if (!child) return root
			return {
				...(root as any),
				[seg]: updateNodeAtPath(child, path.slice(1), updater),
			}
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
	if (slot.kind === 'rootRoot') {
		if (root.type !== 'Builtin') return root
		return { ...(root as any), rootRoot: nextChild }
	}
	if (slot.kind === 'itemRoot') {
		if (root.type === 'Builtin')
			return { ...(root as any), itemRoot: nextChild }
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
	return { type: 'Builtin', kind: 'cover' }
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

export function ThreadTemplateVisualEditor({
	value,
	onChange,
	assets = [],
	historyState,
	setHistoryState,
	resetKey,
	layout = 'split',
	structureClassName,
	propertiesClassName,
	scene: controlledScene,
	onSceneChange,
	selectedKey: controlledSelectedKey,
	onSelectedKeyChange,
}: {
	value: ThreadTemplateConfigV1
	onChange: (next: ThreadTemplateConfigV1) => void
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
	scene?: SceneKey
	onSceneChange?: (scene: SceneKey) => void
	selectedKey?: string
	onSelectedKeyChange?: (key: string) => void
}) {
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
	const [internalSelectedKey, setInternalSelectedKey] = React.useState<string>(() =>
		pathKey('cover', []),
	)
	const selectedKey = controlledSelectedKey ?? internalSelectedKey
	const setSelectedKey = onSelectedKeyChange ?? setInternalSelectedKey
	const [addType, setAddType] =
		React.useState<ThreadRenderTreeNode['type']>('Text')
	const [wrapType, setWrapType] = React.useState<'Stack' | 'Box'>('Box')
	const [copiedNode, setCopiedNode] =
		React.useState<ThreadRenderTreeNode | null>(null)

	const sceneRoot = (value.scenes?.[scene]?.root ??
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
	const visibleTree = React.useMemo(() => {
		const q = treeFilter.trim().toLowerCase()
		if (!q) return tree
		return tree.filter((it) => {
			const label = it.label.toLowerCase()
			const key = it.key.toLowerCase()
			return label.includes(q) || key.includes(q)
		})
	}, [tree, treeFilter])

	const itemByKey = React.useMemo(() => {
		const m = new Map<string, TreeItem>()
		for (const it of tree) m.set(it.key, it)
		return m
	}, [tree])

	React.useEffect(() => {
		const rootKey = pathKey(scene, [])
		if (itemByKey.has(selectedKey)) return
		setSelectedKey(rootKey)
	}, [itemByKey, scene, selectedKey])

	const selected = itemByKey.get(selectedKey) ?? null

	const parentInfo =
		selected && selected.parentKey
			? (itemByKey.get(selected.parentKey) ?? null)
			: null

	const canMoveUp =
		Boolean(selected?.parentSlot?.kind === 'children') &&
		Boolean(
			selected?.parentSlot?.kind === 'children' &&
			selected.parentSlot.index > 0,
		)
	const canMoveDown =
		Boolean(selected?.parentSlot?.kind === 'children') &&
		Boolean(
			selected?.parentSlot?.kind === 'children' &&
			parentInfo &&
			isContainerNode(parentInfo.node) &&
			selected.parentSlot.index < (parentInfo.node.children?.length ?? 0) - 1,
		)

	const canInsertSibling =
		selected?.parentSlot?.kind === 'children' && parentInfo

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
		if (addType !== 'Builtin') return createDefaultNode(addType)
		return scene === 'cover'
			? { type: 'Builtin', kind: 'cover' }
			: { type: 'Builtin', kind: 'repliesList' }
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

	function addChild() {
		if (!sceneRoot || !selected) return
		const node = getNodeAtPath(sceneRoot, selected.path)
		if (!node || !isContainerNode(node)) return
		const child = createNodeToAdd()
		updateSceneRoot(appendChild(sceneRoot, selected.path, child))
	}

	function insertSibling(where: 'before' | 'after') {
		if (!sceneRoot || !selected) return
		if (selected.parentSlot?.kind !== 'children') return
		if (!selected.parentKey) return
		const parent = itemByKey.get(selected.parentKey)
		if (!parent) return
		const idx =
			where === 'before'
				? selected.parentSlot.index
				: selected.parentSlot.index + 1
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

	function wrapSelected() {
		if (!sceneRoot || !selected) return
		updateSelected((n) => {
			if (wrapType === 'Stack')
				return {
					type: 'Stack',
					direction: 'column',
					gap: 12,
					children: [n],
				}
			return { type: 'Box', padding: 12, children: [n] }
		})
	}

	function unwrapSelected() {
		if (!sceneRoot || !selected) return
		const node = getNodeAtPath(sceneRoot, selected.path)
		if (!node || !isContainerNode(node)) return
		const children = node.children ?? []
		if (children.length !== 1) return
		const only = children[0]
		if (!only) return
		updateSelected(() => only)
	}

	function removeSelected() {
		if (!sceneRoot || !selected) return
		if (!selected.parentKey || !selected.parentSlot) return
		const parent = itemByKey.get(selected.parentKey)
		if (!parent) return
		const next = removeFromParent(sceneRoot, parent.path, selected.parentSlot)
		updateSceneRoot(next)
		setSelectedKey(pathKey(scene, parent.path))
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

	const canAddChild = Boolean(selected && isContainerNode(selected.node))
	const canUnwrap =
		Boolean(selected && isContainerNode(selected.node)) &&
		Boolean((selected.node as any).children?.length === 1)

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
						{label}
					</Label>
					<SelectTrigger className="rounded-none font-mono text-xs h-8">
						<SelectValue />
					</SelectTrigger>
				</div>
				<SelectContent>
					<SelectItem value="__none__">none</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label ?? o.value}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		)
	}

	const selectedNode = selected?.node ?? null
	const canUndo = history.past.length > 0
	const canRedo = history.future.length > 0

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

	return (
		<div
			className={
				layout === 'panels'
					? 'contents'
					: 'grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]'
			}
			onKeyDownCapture={(e) => {
				if (isTypingTarget(e.target)) return
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
			}}
		>
			<div
				className={['space-y-3', structureClassName].filter(Boolean).join(' ')}
			>
				<div className="flex items-center justify-between gap-2">
					<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Scene
					</div>
					<div className="flex items-center gap-2">
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
							Cover
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
							Post
						</Button>
					</div>
				</div>

				<Input
					placeholder="Search nodes…"
					value={treeFilter}
					onChange={(e) => setTreeFilter(e.target.value)}
					className="rounded-none font-mono text-xs h-8"
				/>

				<div className="rounded-none border border-border bg-card">
					<div className="max-h-[420px] overflow-auto py-2">
						{visibleTree.map((it) => {
							const active = it.key === selectedKey
							return (
								<button
									key={it.key}
									type="button"
									onClick={() => setSelectedKey(it.key)}
									className={[
										'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs',
										active
											? 'bg-muted text-foreground'
											: 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
									].join(' ')}
								>
									<span style={{ width: it.depth * 12 }} />
									<span className="truncate">{it.label}</span>
								</button>
							)
						})}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Select value={addType} onValueChange={(v) => setAddType(v as any)}>
						<SelectTrigger className="rounded-none font-mono text-xs h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(
								[
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
									'Builtin',
								] as Array<ThreadRenderTreeNode['type']>
							).map((t) => (
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
						Undo
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canRedo}
						onClick={redo}
					>
						Redo
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!selectedNode}
						onClick={() => void copySelected()}
					>
						Copy
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!selectedNode || !copiedNode}
						onClick={pasteCopied}
					>
						Paste
					</Button>
					<Button
						type="button"
						size="sm"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canAddChild}
						onClick={addChild}
					>
						Add Child
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canInsertSibling}
						onClick={() => insertSibling('before')}
					>
						Insert ↑
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canInsertSibling}
						onClick={() => insertSibling('after')}
					>
						Insert ↓
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canInsertSibling}
						onClick={duplicateSelected}
					>
						Duplicate
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canMoveUp}
						onClick={() => moveSelected('up')}
					>
						Up
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canMoveDown}
						onClick={() => moveSelected('down')}
					>
						Down
					</Button>
					<Select value={wrapType} onValueChange={(v) => setWrapType(v as any)}>
						<SelectTrigger className="rounded-none font-mono text-xs h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Box">Wrap: Box</SelectItem>
							<SelectItem value="Stack">Wrap: Stack</SelectItem>
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!selectedNode}
						onClick={wrapSelected}
					>
						Wrap
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!canUnwrap}
						onClick={unwrapSelected}
					>
						Unwrap
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-xs uppercase"
						disabled={!selected?.parentKey}
						onClick={removeSelected}
					>
						Delete
					</Button>
				</div>
			</div>

			<div
				className={['space-y-3', propertiesClassName].filter(Boolean).join(' ')}
			>
				<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Properties
				</div>

				<div className="rounded-none border border-border bg-card p-4 space-y-4">
					{!selectedNode ? (
						<div className="font-mono text-xs text-muted-foreground">
							Select a node to edit.
						</div>
					) : (
						<>
							<div className="flex items-center justify-between gap-3">
								<div className="font-mono text-xs text-foreground">
									{selectedNode.type}
								</div>
								<div className="font-mono text-[10px] text-muted-foreground">
									{scene}
								</div>
							</div>

							{selectedNode.type === 'Text' ? (
								<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
									{textField(
										'text',
										selectedNode.text,
										(v) => updateSelected((n) => ({ ...(n as any), text: v })),
										{ placeholder: 'Text…' },
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
												bind
											</Label>
											<SelectTrigger className="rounded-none font-mono text-xs h-8">
												<SelectValue />
											</SelectTrigger>
										</div>
										<SelectContent>
											<SelectItem value="__none__">none</SelectItem>
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
										'size',
										selectedNode.size,
										(v) => updateSelected((n) => ({ ...(n as any), size: v })),
										{ min: 8, max: 120, step: 1 },
									)}
									{numberField(
										'weight',
										selectedNode.weight,
										(v) =>
											updateSelected((n) => ({ ...(n as any), weight: v })),
										{ min: 100, max: 900, step: 100 },
									)}
									{numberField(
										'opacity',
										(selectedNode as any).opacity,
										(v) =>
											updateSelected((n) => ({ ...(n as any), opacity: v })),
										{ min: 0, max: 1, step: 0.05 },
									)}
									{numberField(
										'maxLines',
										selectedNode.maxLines,
										(v) =>
											updateSelected((n) => ({ ...(n as any), maxLines: v })),
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
												align
											</Label>
											<SelectTrigger className="rounded-none font-mono text-xs h-8">
												<SelectValue />
											</SelectTrigger>
										</div>
										<SelectContent>
											<SelectItem value="__none__">none</SelectItem>
											{(['left', 'center', 'right'] as const).map((a) => (
												<SelectItem key={a} value={a}>
													{a}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectField(
										'color',
										(selectedNode as any).color,
										[
											{ value: 'primary' },
											{ value: 'muted' },
											{ value: 'accent' },
										],
										(v) => updateSelected((n) => ({ ...(n as any), color: v })),
									)}
									{numberField(
										'lineHeight',
										(selectedNode as any).lineHeight,
										(v) =>
											updateSelected((n) => ({
												...(n as any),
												lineHeight: v,
											})),
										{ min: 0.8, max: 3, step: 0.05 },
									)}
									{numberField(
										'letterSpacing',
										(selectedNode as any).letterSpacing,
										(v) =>
											updateSelected((n) => ({
												...(n as any),
												letterSpacing: v,
											})),
										{ min: -2, max: 20, step: 0.1 },
									)}
									{boolField(
										'uppercase',
										(selectedNode as any).uppercase,
										(v) =>
											updateSelected((n) => ({ ...(n as any), uppercase: v })),
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
										(v) => updateSelected((n) => ({ ...(n as any), bind: v })),
									)}
									{selectField(
										'color',
										(selectedNode as any).color,
										[
											{ value: 'primary' },
											{ value: 'muted' },
											{ value: 'accent' },
										],
										(v) => updateSelected((n) => ({ ...(n as any), color: v })),
									)}
									{numberField(
										'size',
										(selectedNode as any).size,
										(v) => updateSelected((n) => ({ ...(n as any), size: v })),
										{ min: 10, max: 64, step: 1 },
									)}
									{numberField(
										'opacity',
										(selectedNode as any).opacity,
										(v) =>
											updateSelected((n) => ({ ...(n as any), opacity: v })),
										{ min: 0, max: 1, step: 0.05 },
									)}
									{boolField('showIcon', (selectedNode as any).showIcon, (v) =>
										updateSelected((n) => ({ ...(n as any), showIcon: v })),
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
										(v) => updateSelected((n) => ({ ...(n as any), bind: v })),
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
										(v) => updateSelected((n) => ({ ...(n as any), size: v })),
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
											updateSelected((n) => ({ ...(n as any), opacity: v })),
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
										(v) => updateSelected((n) => ({ ...(n as any), bind: v })),
									)}
									{numberField(
										'gap',
										(selectedNode as any).gap,
										(v) => updateSelected((n) => ({ ...(n as any), gap: v })),
										{ min: 0, max: 80, step: 1 },
									)}
									{numberField(
										'maxHeight',
										(selectedNode as any).maxHeight,
										(v) =>
											updateSelected((n) => ({ ...(n as any), maxHeight: v })),
										{ min: 100, max: 1200, step: 1 },
									)}
									{numberField(
										'opacity',
										(selectedNode as any).opacity,
										(v) =>
											updateSelected((n) => ({ ...(n as any), opacity: v })),
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
										(v) => updateSelected((n) => ({ ...(n as any), flex: v })),
										{ min: 0, max: 100, step: 1 },
									)}
									{numberField(
										'opacity',
										(selectedNode as any).opacity,
										(v) =>
											updateSelected((n) => ({ ...(n as any), opacity: v })),
										{ min: 0, max: 1, step: 0.05 },
									)}
									{numberField(
										'gap',
										(selectedNode as any).gap,
										(v) => updateSelected((n) => ({ ...(n as any), gap: v })),
										{ min: 0, max: 240, step: 1 },
									)}
									{numberField(
										'gapX',
										(selectedNode as any).gapX,
										(v) => updateSelected((n) => ({ ...(n as any), gapX: v })),
										{ min: 0, max: 240, step: 1 },
									)}
									{numberField(
										'gapY',
										(selectedNode as any).gapY,
										(v) => updateSelected((n) => ({ ...(n as any), gapY: v })),
										{ min: 0, max: 240, step: 1 },
									)}
									{numberField(
										'padding',
										(selectedNode as any).padding,
										(v) =>
											updateSelected((n) => ({ ...(n as any), padding: v })),
										{ min: 0, max: 240, step: 1 },
									)}
									{numberField(
										'paddingX',
										(selectedNode as any).paddingX,
										(v) =>
											updateSelected((n) => ({ ...(n as any), paddingX: v })),
										{ min: 0, max: 240, step: 1 },
									)}
									{numberField(
										'paddingY',
										(selectedNode as any).paddingY,
										(v) =>
											updateSelected((n) => ({ ...(n as any), paddingY: v })),
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
											updateSelected((n) => ({ ...(n as any), overflow: v })),
									)}
									{numberField(
										'width',
										(selectedNode as any).width,
										(v) => updateSelected((n) => ({ ...(n as any), width: v })),
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
											updateSelected((n) => ({ ...(n as any), maxWidth: v })),
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
													direction
												</Label>
												<SelectTrigger className="rounded-none font-mono text-xs h-8">
													<SelectValue />
												</SelectTrigger>
											</div>
											<SelectContent>
												<SelectItem value="column">column</SelectItem>
												<SelectItem value="row">row</SelectItem>
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
												updateSelected((n) => ({ ...(n as any), assetId: v }))
											}}
										>
											<div className="space-y-1">
												<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
													Pick Asset
												</Label>
												<SelectTrigger className="rounded-none font-mono text-xs h-8">
													<SelectValue placeholder="Select…" />
												</SelectTrigger>
											</div>
											<SelectContent>
												<SelectItem value="__pick__">Select…</SelectItem>
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
											(v) => updateSelected((n) => ({ ...(n as any), fit: v })),
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
												updateSelected((n) => ({ ...(n as any), width: v })),
											{ min: 16, max: 1600, step: 1 },
										)}
										{numberField(
											'height',
											(selectedNode as any).height,
											(v) =>
												updateSelected((n) => ({ ...(n as any), height: v })),
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
										{boolField('border', (selectedNode as any).border, (v) =>
											updateSelected((n) => ({ ...(n as any), border: v })),
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
												Pick Asset
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
											updateSelected((n) => ({ ...(n as any), opacity: v })),
										{ min: 0, max: 1, step: 0.05 },
									)}
									{numberField(
										'blur',
										selectedNode.blur,
										(v) => updateSelected((n) => ({ ...(n as any), blur: v })),
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
											updateSelected((n) => ({ ...(n as any), opacity: v })),
										{ min: 0, max: 1, step: 0.05 },
									)}
									{boolField('pointerEvents', selectedNode.pointerEvents, (v) =>
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

							{selectedNode.type === 'Builtin' ? (
								<div className="space-y-3">
									<Select
										value={selectedNode.kind}
										onValueChange={(v) =>
											updateSelected((n) => ({ ...(n as any), kind: v }))
										}
									>
										<div className="space-y-1">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												kind
											</Label>
											<SelectTrigger className="rounded-none font-mono text-xs h-8">
												<SelectValue />
											</SelectTrigger>
										</div>
										<SelectContent>
											{(
												[
													'cover',
													'repliesList',
													'repliesListHeader',
													'repliesListRootPost',
													'repliesListReplies',
												] as const
											).map((k) => (
												<SelectItem key={k} value={k}>
													{k}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedNode.kind === 'repliesList' ||
									selectedNode.kind === 'repliesListRootPost' ? (
										<div className="space-y-2">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div className="font-mono text-xs text-muted-foreground">
													rootRoot
												</div>
												<div className="flex flex-wrap items-center gap-2">
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="rounded-none font-mono text-[10px] uppercase"
														disabled={(selectedNode as any).rootRoot != null}
														onClick={() =>
															updateSelected((n) => ({
																...(n as any),
																rootRoot: createDefaultNode('Stack'),
															}))
														}
													>
														Add
													</Button>
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="rounded-none font-mono text-[10px] uppercase"
														disabled={(selectedNode as any).rootRoot == null}
														onClick={() => {
															if (!selected) return
															setSelectedKey(
																pathKey(scene, [...selected.path, 'rootRoot']),
															)
														}}
													>
														Select
													</Button>
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="rounded-none font-mono text-[10px] uppercase"
														disabled={(selectedNode as any).rootRoot == null}
														onClick={() =>
															updateSelected((n) => ({
																...(n as any),
																rootRoot: undefined,
															}))
														}
													>
														Clear
													</Button>
												</div>
											</div>
											{boolField(
												'wrapRootRoot',
												(selectedNode as any).wrapRootRoot,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														wrapRootRoot: v,
													})),
											)}
										</div>
									) : null}

									{selectedNode.kind === 'repliesList' ||
									selectedNode.kind === 'repliesListReplies' ? (
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
														disabled={(selectedNode as any).itemRoot != null}
														onClick={() =>
															updateSelected((n) => ({
																...(n as any),
																itemRoot: createDefaultNode('Stack'),
															}))
														}
													>
														Add
													</Button>
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="rounded-none font-mono text-[10px] uppercase"
														disabled={(selectedNode as any).itemRoot == null}
														onClick={() => {
															if (!selected) return
															setSelectedKey(
																pathKey(scene, [...selected.path, 'itemRoot']),
															)
														}}
													>
														Select
													</Button>
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="rounded-none font-mono text-[10px] uppercase"
														disabled={(selectedNode as any).itemRoot == null}
														onClick={() =>
															updateSelected((n) => ({
																...(n as any),
																itemRoot: undefined,
															}))
														}
													>
														Clear
													</Button>
												</div>
											</div>
											{boolField(
												'wrapItemRoot',
												(selectedNode as any).wrapItemRoot,
												(v) =>
													updateSelected((n) => ({
														...(n as any),
														wrapItemRoot: v,
													})),
											)}
										</div>
									) : null}

									{selectedNode.kind === 'repliesList' ||
									selectedNode.kind === 'repliesListReplies' ? (
										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											{numberField('gap', (selectedNode as any).gap, (v) =>
												updateSelected((n) => ({ ...(n as any), gap: v })),
											)}
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
														highlight: { ...(n as any).highlight, opacity: v },
													})),
												{ min: 0, max: 1, step: 0.05 },
											)}
										</div>
									) : null}
									<div className="font-mono text-xs text-muted-foreground">
										Note: rootRoot/itemRoot editing is supported by selecting
										them in the tree.
									</div>
								</div>
							) : null}

							{selectedNode.type === 'Repeat' ? (
								<div className="space-y-3">
									<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
										{numberField(
											'maxItems',
											(selectedNode as any).maxItems,
											(v) =>
												updateSelected((n) => ({ ...(n as any), maxItems: v })),
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
										{boolField('scroll', (selectedNode as any).scroll, (v) =>
											updateSelected((n) => ({ ...(n as any), scroll: v })),
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
															pathKey(scene, [...selected.path, 'itemRoot']),
														)
													}}
												>
													Select
												</Button>
											</div>
										</div>
										<div className="font-mono text-xs text-muted-foreground">
											Note: Repeat renders each reply with ctx.post = reply.
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
													highlight: { ...(n as any).highlight, thickness: v },
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
													highlight: { ...(n as any).highlight, opacity: v },
												})),
											{ min: 0, max: 1, step: 0.05 },
										)}
									</div>
								</div>
							) : null}
						</>
					)}
				</div>
			</div>
		</div>
	)
}
