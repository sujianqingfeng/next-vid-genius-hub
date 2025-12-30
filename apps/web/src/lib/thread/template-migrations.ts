type JsonObject = Record<string, unknown>

function isPlainObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneArray<T>(value: T[]): T[] {
	return value.slice()
}

function rewritePostBindsToRoot(rawNode: unknown): unknown {
	if (!isPlainObject(rawNode)) return rawNode

	const type = rawNode.type
	let changed = false
	const node: JsonObject = { ...rawNode }

	if (typeof node.bind === 'string' && node.bind.startsWith('post.')) {
		node.bind = `root.${node.bind.slice('post.'.length)}`
		changed = true
	}

	const rewriteChildren = (key: string) => {
		const childrenRaw = node[key]
		if (!Array.isArray(childrenRaw)) return
		const nextChildren = cloneArray(childrenRaw)
		let did = false
		for (let i = 0; i < nextChildren.length; i++) {
			const migrated = rewritePostBindsToRoot(nextChildren[i])
			if (migrated !== nextChildren[i]) {
				nextChildren[i] = migrated
				did = true
			}
		}
		if (did) {
			node[key] = nextChildren
			changed = true
		}
	}

	if (
		type === 'Stack' ||
		type === 'Grid' ||
		type === 'Box' ||
		type === 'Absolute'
	) {
		rewriteChildren('children')
	}

	if (type === 'Builtin') {
		if ('rootRoot' in node) {
			const next = rewritePostBindsToRoot(node.rootRoot)
			if (next !== node.rootRoot) {
				node.rootRoot = next
				changed = true
			}
		}
		if ('itemRoot' in node) {
			const next = rewritePostBindsToRoot(node.itemRoot)
			if (next !== node.itemRoot) {
				node.itemRoot = next
				changed = true
			}
		}
	}

	if (type === 'Repeat') {
		if ('itemRoot' in node) {
			const next = rewritePostBindsToRoot(node.itemRoot)
			if (next !== node.itemRoot) {
				node.itemRoot = next
				changed = true
			}
		}
	}

	return changed ? node : rawNode
}

function buildDefaultRepliesHeaderNode(): JsonObject {
	return {
		type: 'Stack',
		direction: 'row',
		align: 'end',
		justify: 'between',
		gapX: 24,
		children: [
			{
				type: 'Stack',
				direction: 'row',
				align: 'center',
				gapX: 12,
				children: [
					{
						type: 'Box',
						width: 10,
						height: 10,
						background: 'var(--tf-accent)',
					},
					{
						type: 'Text',
						bind: 'thread.title',
						color: 'muted',
						size: 12,
						weight: 700,
						maxLines: 1,
					},
				],
			},
			{
				type: 'Text',
				bind: 'timeline.replyIndicator',
				color: 'muted',
				size: 12,
				weight: 700,
				maxLines: 1,
			},
		],
	}
}

function buildDefaultRootPostNode(): JsonObject {
	return {
		type: 'Stack',
		gapY: 14,
		children: [
			{
				type: 'Stack',
				direction: 'row',
				align: 'center',
				justify: 'between',
				gapX: 14,
				children: [
					{
						type: 'Stack',
						direction: 'row',
						align: 'center',
						gapX: 12,
						children: [
							{
								type: 'Avatar',
								bind: 'root.author.avatarAssetId',
								size: 44,
								border: true,
							},
							{
								type: 'Text',
								bind: 'root.author.name',
								size: 18,
								weight: 800,
								maxLines: 1,
							},
						],
					},
					{
						type: 'Metrics',
						bind: 'root.metrics.likes',
						color: 'muted',
						size: 14,
						showIcon: true,
					},
				],
			},
			{ type: 'Divider', margin: 0, opacity: 0.7 },
			{
				type: 'ContentBlocks',
				bind: 'root.contentBlocks',
				gap: 16,
				maxHeight: 1700,
			},
		],
	}
}

function wrapSurfaceCard(child: unknown, kind: 'root' | 'replies'): JsonObject {
	return {
		type: 'Box',
		border: true,
		background:
			kind === 'root' ? 'var(--tf-surface)' : 'rgba(255,255,255,0.02)',
		padding: kind === 'root' ? 28 : 18,
		children: [child],
	}
}

function buildDefaultRepeatNodeFromBuiltinReplies(
	node: JsonObject,
): JsonObject {
	const itemRoot =
		node.itemRoot ??
		({
			type: 'Text',
			bind: 'post.plainText',
			maxLines: 10,
		} satisfies JsonObject)

	const repeat: JsonObject = {
		type: 'Repeat',
		source: 'replies',
		itemRoot,
	}

	for (const k of ['gap', 'wrapItemRoot', 'highlight'] as const) {
		if (k in node) repeat[k] = node[k]
	}

	return repeat
}

function migrateRenderTreeNode(
	rawNode: unknown,
	{
		allowRepliesListToSplitLayout,
	}: {
		allowRepliesListToSplitLayout: boolean
	},
	stats: {
		builtinRepliesListReplies: number
		builtinRepliesListHeader: number
		builtinRepliesListRootPost: number
		builtinRepliesList: number
	},
): unknown {
	if (!isPlainObject(rawNode)) return rawNode

	const type = rawNode.type
	const node: JsonObject = { ...rawNode }
	let changed = false

	const migrateChild = (key: string) => {
		const raw = node[key]
		const next = migrateRenderTreeNode(
			raw,
			{ allowRepliesListToSplitLayout: false },
			stats,
		)
		if (next !== raw) {
			node[key] = next
			changed = true
		}
	}

	const migrateChildrenArray = (key: string) => {
		const raw = node[key]
		if (!Array.isArray(raw)) return
		const nextChildren = cloneArray(raw)
		let did = false
		for (let i = 0; i < nextChildren.length; i++) {
			const next = migrateRenderTreeNode(
				nextChildren[i],
				{ allowRepliesListToSplitLayout: false },
				stats,
			)
			if (next !== nextChildren[i]) {
				nextChildren[i] = next
				did = true
			}
		}
		if (did) {
			node[key] = nextChildren
			changed = true
		}
	}

	if (
		type === 'Stack' ||
		type === 'Grid' ||
		type === 'Box' ||
		type === 'Absolute'
	) {
		migrateChildrenArray('children')
		return changed ? node : rawNode
	}

	if (type === 'Repeat') {
		migrateChild('itemRoot')
		return changed ? node : rawNode
	}

	if (type !== 'Builtin') return rawNode

	const kind = node.kind
	if (kind === 'repliesListReplies') {
		stats.builtinRepliesListReplies += 1
		return buildDefaultRepeatNodeFromBuiltinReplies(node)
	}

	if (kind === 'repliesListHeader') {
		stats.builtinRepliesListHeader += 1
		return buildDefaultRepliesHeaderNode()
	}

	if (kind === 'repliesListRootPost') {
		stats.builtinRepliesListRootPost += 1
		const rootRootRaw = node.rootRoot ?? buildDefaultRootPostNode()
		const rootRoot = rewritePostBindsToRoot(rootRootRaw)
		const wrapRootRoot = node.wrapRootRoot === true
		return wrapRootRoot ? wrapSurfaceCard(rootRoot, 'root') : rootRoot
	}

	if (kind === 'repliesList' && allowRepliesListToSplitLayout) {
		stats.builtinRepliesList += 1

		const rootRootRaw = node.rootRoot ?? buildDefaultRootPostNode()
		const rootRoot = rewritePostBindsToRoot(rootRootRaw)
		const wrapRootRoot = node.wrapRootRoot === true
		const left = wrapRootRoot ? wrapSurfaceCard(rootRoot, 'root') : rootRoot

		const repliesRepeat = buildDefaultRepeatNodeFromBuiltinReplies(node)
		const right = wrapSurfaceCard(repliesRepeat, 'replies')

		return {
			type: 'Stack',
			direction: 'column',
			gapY: 18,
			padding: 64,
			children: [
				buildDefaultRepliesHeaderNode(),
				{
					type: 'Stack',
					direction: 'row',
					align: 'stretch',
					gapX: 22,
					flex: 1,
					children: [
						{ type: 'Box', flex: 58, maxHeight: 2000, children: [left] },
						{ type: 'Box', flex: 42, maxHeight: 2000, children: [right] },
					],
				},
			],
		}
	}

	if (kind === 'repliesList') {
		for (const k of ['rootRoot', 'itemRoot'] as const) {
			if (k in node) migrateChild(k)
		}
	}

	return changed ? node : rawNode
}

export function migrateThreadTemplateConfigBuiltinsToRepeat(input: unknown): {
	value: unknown
	changed: boolean
	stats: {
		builtinRepliesListReplies: number
		builtinRepliesListHeader: number
		builtinRepliesListRootPost: number
		builtinRepliesList: number
	}
} {
	if (!isPlainObject(input) || input.version !== 1) {
		return {
			value: input,
			changed: false,
			stats: {
				builtinRepliesListReplies: 0,
				builtinRepliesListHeader: 0,
				builtinRepliesListRootPost: 0,
				builtinRepliesList: 0,
			},
		}
	}

	const stats = {
		builtinRepliesListReplies: 0,
		builtinRepliesListHeader: 0,
		builtinRepliesListRootPost: 0,
		builtinRepliesList: 0,
	}

	const next: JsonObject = { ...input }
	const scenesRaw = input.scenes
	if (!isPlainObject(scenesRaw)) {
		return { value: input, changed: false, stats }
	}

	const scenes: JsonObject = { ...scenesRaw }
	let changed = false

	const migrateSceneRoot = (
		sceneKey: 'cover' | 'post',
		allowRepliesListToSplitLayout: boolean,
	) => {
		const sceneRaw = scenes[sceneKey]
		if (!isPlainObject(sceneRaw)) return
		const rootRaw = (sceneRaw as any).root
		const rootNext = migrateRenderTreeNode(
			rootRaw,
			{ allowRepliesListToSplitLayout },
			stats,
		)
		if (rootNext === rootRaw) return
		scenes[sceneKey] = { ...(sceneRaw as any), root: rootNext }
		changed = true
	}

	migrateSceneRoot('cover', false)
	migrateSceneRoot('post', true)

	if (!changed) return { value: input, changed: false, stats }
	next.scenes = scenes
	return { value: next, changed: true, stats }
}
