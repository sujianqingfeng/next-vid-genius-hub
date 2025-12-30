import type {
	ThreadRenderTreeNode,
	ThreadTemplateConfigV1,
} from '@app/remotion-project/types'

function addAssetId(out: Set<string>, assetId: unknown) {
	if (typeof assetId !== 'string') return
	const id = assetId.trim()
	if (!id) return
	if (id.startsWith('__') && id.endsWith('__')) return
	if (
		id.startsWith('ext:') ||
		id.startsWith('http://') ||
		id.startsWith('https://')
	) {
		return
	}
	out.add(id)
}

function collectRenderTreeAssetIds(
	node: ThreadRenderTreeNode | undefined,
	out: Set<string>,
) {
	if (!node) return

	if (node.type === 'Background') {
		addAssetId(out, node.assetId)
		return
	}

	if (node.type === 'Image' || node.type === 'Video') {
		addAssetId(out, node.assetId)
		return
	}

	if (node.type === 'Builtin' && node.kind === 'repliesList') {
		collectRenderTreeAssetIds(node.rootRoot, out)
		collectRenderTreeAssetIds(node.itemRoot, out)
		return
	}

	if (node.type === 'Builtin' && node.kind === 'repliesListRootPost') {
		collectRenderTreeAssetIds(node.rootRoot, out)
		return
	}

	if (node.type === 'Builtin' && node.kind === 'repliesListReplies') {
		collectRenderTreeAssetIds(node.itemRoot, out)
		return
	}

	if (
		node.type === 'Stack' ||
		node.type === 'Grid' ||
		node.type === 'Absolute' ||
		node.type === 'Box'
	) {
		for (const c of node.children ?? []) collectRenderTreeAssetIds(c, out)
		return
	}
}

export function collectThreadTemplateAssetIds(
	templateConfigResolved: ThreadTemplateConfigV1 | undefined,
): Set<string> {
	const out = new Set<string>()
	if (!templateConfigResolved?.scenes) return out
	collectRenderTreeAssetIds(templateConfigResolved.scenes.cover?.root, out)
	collectRenderTreeAssetIds(templateConfigResolved.scenes.post?.root, out)
	return out
}
