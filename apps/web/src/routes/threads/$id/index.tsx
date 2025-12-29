import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { ThreadRemotionPreviewCard } from '~/components/business/threads/thread-remotion-preview-card'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import {
	DEFAULT_THREAD_TEMPLATE_ID,
	listThreadTemplates,
} from '@app/remotion-project/thread-templates'
import {
	DEFAULT_THREAD_TEMPLATE_CONFIG,
	normalizeThreadTemplateConfig,
} from '@app/remotion-project/thread-template-config'
import type { ThreadTemplateConfigV1 } from '@app/remotion-project/types'

const IMAGE_ASSET_ID_PLACEHOLDER = '__IMAGE_ASSET_ID__'
const VIDEO_ASSET_ID_PLACEHOLDER = '__VIDEO_ASSET_ID__'

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function containsUnsafeCssUrl(value: string): boolean {
	const lower = value.toLowerCase()
	return (
		lower.includes('url(') ||
		lower.includes('image-set(') ||
		lower.includes('image(') ||
		lower.includes('src(') ||
		lower.includes('http://') ||
		lower.includes('https://') ||
		lower.includes('ext:')
	)
}

function buildRepliesListItemRootExample(): ThreadTemplateConfigV1 {
	return {
		version: 1,
		typography: { fontPreset: 'noto', fontScale: 1 },
		scenes: {
			post: {
				root: {
					type: 'Builtin',
					kind: 'repliesList',
					rootRoot: {
						type: 'Stack',
						direction: 'column',
						gap: 14,
						children: [
							{
								type: 'Stack',
								direction: 'row',
								align: 'center',
								gap: 12,
								children: [
									{
										type: 'Avatar',
										bind: 'root.author.avatarAssetId',
										size: 44,
										border: true,
									},
									{
										type: 'Stack',
										direction: 'column',
										gap: 4,
										children: [
											{
												type: 'Text',
												bind: 'root.author.name',
												size: 18,
												weight: 800,
												maxLines: 1,
											},
											{
												type: 'Text',
												bind: 'root.author.handle',
												color: 'muted',
												size: 14,
												weight: 600,
												maxLines: 1,
											},
										],
									},
								],
							},
							{
								type: 'Divider',
								opacity: 0.75,
								margin: 10,
							},
							{
								type: 'Image',
								assetId: IMAGE_ASSET_ID_PLACEHOLDER,
								fit: 'contain',
								height: 240,
								radius: 12,
								border: true,
								background: 'rgba(255,255,255,0.02)',
							},
							{
								type: 'Spacer',
								axis: 'y',
								size: 6,
							},
							{
								type: 'Video',
								assetId: VIDEO_ASSET_ID_PLACEHOLDER,
								fit: 'cover',
								height: 300,
								radius: 12,
								border: true,
								background: 'rgba(0,0,0,0.25)',
							},
							{
								type: 'Spacer',
								axis: 'y',
								size: 6,
							},
							{
								type: 'Box',
								border: true,
								background: 'rgba(255,255,255,0.02)',
								padding: 14,
								radius: 12,
								children: [
									{
										type: 'ContentBlocks',
										bind: 'root.contentBlocks',
										gap: 12,
										maxHeight: 520,
									},
								],
							},
						],
					},
					itemRoot: {
						type: 'Stack',
						direction: 'column',
						gap: 14,
						children: [
							{
								type: 'Stack',
								direction: 'row',
								align: 'center',
								gap: 12,
								children: [
									{
										type: 'Avatar',
										bind: 'post.author.avatarAssetId',
										size: 44,
										border: true,
									},
									{
										type: 'Stack',
										direction: 'column',
										gap: 4,
										children: [
											{
												type: 'Text',
												bind: 'post.author.name',
												size: 18,
												weight: 800,
												maxLines: 1,
											},
											{
												type: 'Text',
												bind: 'post.author.handle',
												color: 'muted',
												size: 14,
												weight: 600,
												maxLines: 1,
											},
										],
									},
								],
							},
							{
								type: 'Divider',
								opacity: 0.75,
								margin: 10,
							},
							{
								type: 'Image',
								assetId: IMAGE_ASSET_ID_PLACEHOLDER,
								fit: 'contain',
								height: 220,
								radius: 12,
								border: true,
								background: 'rgba(255,255,255,0.02)',
							},
							{
								type: 'Spacer',
								axis: 'y',
								size: 6,
							},
							{
								type: 'Video',
								assetId: VIDEO_ASSET_ID_PLACEHOLDER,
								fit: 'cover',
								height: 280,
								radius: 12,
								border: true,
								background: 'rgba(0,0,0,0.25)',
							},
							{
								type: 'Spacer',
								axis: 'y',
								size: 6,
							},
							{
								type: 'Box',
								border: true,
								background: 'rgba(255,255,255,0.02)',
								padding: 14,
								radius: 12,
								children: [
									{
										type: 'ContentBlocks',
										bind: 'post.contentBlocks',
										gap: 12,
										maxHeight: 360,
									},
								],
							},
							{
								type: 'Spacer',
								axis: 'y',
								size: 4,
							},
						],
					},
				},
			},
		},
	}
}

function buildCoverRootExample(): ThreadTemplateConfigV1 {
	return {
		version: 1,
		typography: { fontPreset: 'noto', fontScale: 1 },
		scenes: {
			cover: {
				root: {
					type: 'Stack',
					direction: 'column',
					align: 'center',
					justify: 'center',
					gap: 18,
					padding: 64,
					children: [
						{
							type: 'Text',
							bind: 'thread.title',
							size: 56,
							weight: 900,
							align: 'center',
							maxLines: 3,
						},
						{
							type: 'Spacer',
							axis: 'y',
							size: 8,
						},
						{
							type: 'Image',
							assetId: IMAGE_ASSET_ID_PLACEHOLDER,
							fit: 'contain',
							height: 260,
							radius: 12,
							border: true,
							background: 'rgba(255,255,255,0.02)',
						},
						{
							type: 'Divider',
							opacity: 0.75,
							margin: 18,
						},
						{
							type: 'Stack',
							direction: 'row',
							align: 'center',
							justify: 'center',
							gap: 14,
							children: [
								{
									type: 'Avatar',
									bind: 'root.author.avatarAssetId',
									size: 52,
									border: true,
								},
								{
									type: 'Stack',
									direction: 'column',
									gap: 4,
									children: [
										{
											type: 'Text',
											bind: 'root.author.name',
											size: 20,
											weight: 800,
											maxLines: 1,
										},
										{
											type: 'Text',
											bind: 'thread.source',
											color: 'muted',
											size: 14,
											weight: 600,
											maxLines: 1,
										},
									],
								},
							],
						},
					],
				},
			},
		},
	}
}

function buildGridSnippetExample(): Record<string, unknown> {
	return {
		type: 'Grid',
		columns: 2,
		align: 'stretch',
		justify: 'stretch',
		gapX: 24,
		gapY: 16,
		paddingX: 24,
		paddingY: 18,
		children: [
			{
				type: 'Box',
				border: true,
				background: 'rgba(255,255,255,0.04)',
				padding: 18,
				radius: 12,
				children: [
					{
						type: 'Text',
						bind: 'post.author.name',
						size: 18,
						weight: 800,
						maxLines: 1,
					},
					{
						type: 'Text',
						bind: 'post.plainText',
						color: 'muted',
						size: 14,
						weight: 600,
						maxLines: 6,
					},
				],
			},
			{
				type: 'Box',
				border: true,
				background: 'rgba(255,255,255,0.02)',
				padding: 18,
				radius: 12,
				children: [
					{
						type: 'ContentBlocks',
						bind: 'post.contentBlocks',
						gap: 12,
						maxHeight: 520,
					},
				],
			},
		],
	}
}

function buildAbsoluteSnippetExample(): Record<string, unknown> {
	return {
		type: 'Absolute',
		x: 80,
		y: 80,
		width: 860,
		children: [
			{
				type: 'Box',
				border: true,
				background: 'var(--tf-surface)',
				paddingX: 28,
				paddingY: 22,
				radius: 14,
				children: [
					{
						type: 'Text',
						bind: 'thread.title',
						size: 42,
						weight: 900,
						maxLines: 2,
					},
					{
						type: 'Text',
						bind: 'thread.source',
						color: 'muted',
						size: 14,
						weight: 700,
						maxLines: 1,
					},
				],
			},
		],
	}
}

function buildRepliesListHeaderSnippetExample(): Record<string, unknown> {
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
					{ type: 'Box', width: 10, height: 10, background: 'var(--tf-accent)' },
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

function buildRepliesHighlightSnippetExample(): Record<string, unknown> {
	return {
		type: 'Builtin',
		kind: 'repliesListReplies',
		gap: 12,
		highlight: {
			enabled: true,
			color: 'accent',
			thickness: 3,
			radius: 0,
			opacity: 1,
		},
	}
}

function buildRepliesListSplitLayoutExample(): ThreadTemplateConfigV1 {
	return {
		version: 1,
		typography: { fontPreset: 'noto', fontScale: 1 },
		scenes: {
			post: {
				root: {
					type: 'Stack',
					gapY: 18,
					padding: 64,
					children: [
						buildRepliesListHeaderSnippetExample() as any,
						{
							type: 'Grid',
							columns: 2,
							gapX: 22,
							gapY: 16,
							align: 'stretch',
							justify: 'stretch',
							children: [
								{
									type: 'Builtin',
									kind: 'repliesListRootPost',
									wrapRootRoot: true,
									rootRoot: {
										type: 'Stack',
										gapY: 14,
										children: [
											{
												type: 'Stack',
												direction: 'row',
												align: 'center',
												gapX: 12,
												children: [
													{
														type: 'Avatar',
														bind: 'post.author.avatarAssetId',
														size: 44,
														border: true,
													},
													{
														type: 'Stack',
														direction: 'column',
														gapY: 2,
														children: [
															{
																type: 'Text',
																bind: 'post.author.name',
																size: 18,
																weight: 800,
																maxLines: 1,
															},
															{
																type: 'Text',
																bind: 'post.author.handle',
																color: 'muted',
																size: 14,
																weight: 600,
																maxLines: 1,
															},
														],
													},
												],
											},
											{ type: 'Divider', opacity: 0.6, margin: 12 },
											{
												type: 'ContentBlocks',
												bind: 'post.contentBlocks',
												gap: 12,
												maxHeight: 900,
											},
										],
									},
								},
								{
									type: 'Box',
									border: true,
									background: 'rgba(255,255,255,0.02)',
									padding: 18,
									children: [
										{
											type: 'Builtin',
											kind: 'repliesListReplies',
											wrapItemRoot: true,
											gap: 12,
											highlight: {
												enabled: true,
												color: 'accent',
												thickness: 3,
												radius: 0,
												opacity: 1,
											},
											itemRoot: {
												type: 'Text',
												bind: 'post.plainText',
												maxLines: 10,
											},
										},
									],
								},
							],
						},
					],
				},
			},
		},
	}
}

function isSupportedRenderTreeNodeType(type: unknown): boolean {
	return (
		type === 'Background' ||
		type === 'Builtin' ||
		type === 'Stack' ||
		type === 'Grid' ||
		type === 'Absolute' ||
		type === 'Box' ||
		type === 'Image' ||
		type === 'Video' ||
		type === 'Spacer' ||
		type === 'Divider' ||
		type === 'Text' ||
		type === 'Watermark' ||
		type === 'Metrics' ||
		type === 'Avatar' ||
		type === 'ContentBlocks'
	)
}

function analyzeRenderTreeNode(
	rawNode: unknown,
	path: string,
	state: { issues: string[]; nodeCount: number; truncated: boolean },
	depth: number,
	assetsById?: Map<string, any>,
) {
	const MAX_DEPTH = 12
	const MAX_NODES = 200
	const MAX_ISSUES = 80

	const push = (msg: string) => {
		if (state.issues.length >= MAX_ISSUES) {
			if (!state.truncated) {
				state.issues.push('…too many issues, truncated.')
				state.truncated = true
			}
			return
		}
		state.issues.push(msg)
	}

	if (depth > MAX_DEPTH) {
		push(`${path}: too deep (>${MAX_DEPTH}); ignored.`)
		return
	}
	if (!isPlainObject(rawNode)) {
		push(`${path}: must be an object RenderTree node; ignored.`)
		return
	}

	const type = (rawNode as any).type
	if (!isSupportedRenderTreeNodeType(type)) {
		push(`${path}.type: unsupported (${String(type)}); ignored.`)
		return
	}

	state.nodeCount += 1
	if (state.nodeCount > MAX_NODES) {
		push(`RenderTree: too many nodes (>${MAX_NODES}); extra nodes ignored.`)
		return
	}

	const keys = Object.keys(rawNode)
	const warnUnknownKeys = (allowed: Set<string>) => {
		for (const k of keys) {
			if (!allowed.has(k)) push(`${path}: ignored field: ${k}`)
		}
	}

	const warnSizeProps = () => {
		for (const k of ['width', 'height', 'maxWidth', 'maxHeight'] as const) {
			if (!(k in (rawNode as any))) continue
			const v = (rawNode as any)[k]
			if (v == null) continue
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				push(`${path}.${k}: must be a number; ignored.`)
				continue
			}
			const min = 0
			const max = 2000
			if (v < min || v > max)
				push(`${path}.${k}: must be between ${min} and ${max}; clamped.`)
		}
	}

	const warnFlexProp = () => {
		const v = (rawNode as any).flex
		if (v == null) return
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			push(`${path}.flex: must be a number; ignored.`)
			return
		}
		const min = 0
		const max = 100
		if (v < min || v > max)
			push(`${path}.flex: must be between ${min} and ${max}; clamped.`)
	}

	const warnSpaceProps = (keys: string[], min: number, max: number) => {
		for (const k of keys) {
			if (!(k in (rawNode as any))) continue
			const v = (rawNode as any)[k]
			if (v == null) continue
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				push(`${path}.${k}: must be a number; ignored.`)
				continue
			}
			if (v < min || v > max)
				push(`${path}.${k}: must be between ${min} and ${max}; clamped.`)
		}
	}

	if (type === 'Builtin') {
		warnUnknownKeys(
			new Set([
				'type',
				'kind',
				'rootRoot',
				'itemRoot',
				'wrapRootRoot',
				'wrapItemRoot',
				'gap',
				'highlight',
			]),
		)
		const kind = (rawNode as any).kind
		const kindAllowed =
			kind === 'cover' ||
			kind === 'repliesList' ||
			kind === 'repliesListHeader' ||
			kind === 'repliesListRootPost' ||
			kind === 'repliesListReplies'
		if (!kindAllowed) {
			push(
				`${path}.kind: must be 'cover' | 'repliesList' | 'repliesListHeader' | 'repliesListRootPost' | 'repliesListReplies'; ignored.`,
			)
			return
		}
		const gap = (rawNode as any).gap
		if (gap != null) {
			if (kind !== 'repliesList' && kind !== 'repliesListReplies') {
				push(
					`${path}.gap is ignored unless kind='repliesList' or kind='repliesListReplies'.`,
				)
			} else if (typeof gap !== 'number' || !Number.isFinite(gap)) {
				push(`${path}.gap: must be a number; ignored.`)
			} else if (gap < 0 || gap > 80) {
				push(`${path}.gap: must be between 0 and 80; clamped.`)
			}
		}

		const highlight = (rawNode as any).highlight
		if (highlight != null) {
			if (kind !== 'repliesList' && kind !== 'repliesListReplies') {
				push(
					`${path}.highlight is ignored unless kind='repliesList' or kind='repliesListReplies'.`,
				)
			} else if (!isPlainObject(highlight)) {
				push(`${path}.highlight: must be an object; ignored.`)
			} else {
				const allowed = new Set([
					'enabled',
					'color',
					'thickness',
					'radius',
					'opacity',
				])
				for (const k of Object.keys(highlight)) {
					if (!allowed.has(k)) push(`${path}.highlight: ignored field: ${k}`)
				}
				if ('enabled' in highlight && typeof (highlight as any).enabled !== 'boolean') {
					push(`${path}.highlight.enabled: must be boolean; ignored.`)
				}
				if ('color' in highlight) {
					const v = (highlight as any).color
					if (v != null && v !== 'primary' && v !== 'muted' && v !== 'accent') {
						push(
							`${path}.highlight.color: must be 'primary' | 'muted' | 'accent'; ignored.`,
						)
					}
				}
				if ('thickness' in highlight) {
					const v = (highlight as any).thickness
					if (v != null) {
						if (typeof v !== 'number' || !Number.isFinite(v)) {
							push(`${path}.highlight.thickness: must be a number; ignored.`)
						} else if (v < 1 || v > 12) {
							push(`${path}.highlight.thickness: must be between 1 and 12; clamped.`)
						}
					}
				}
				if ('radius' in highlight) {
					const v = (highlight as any).radius
					if (v != null) {
						if (typeof v !== 'number' || !Number.isFinite(v)) {
							push(`${path}.highlight.radius: must be a number; ignored.`)
						} else if (v < 0 || v > 48) {
							push(`${path}.highlight.radius: must be between 0 and 48; clamped.`)
						}
					}
				}
				if ('opacity' in highlight) {
					const v = (highlight as any).opacity
					if (v != null) {
						if (typeof v !== 'number' || !Number.isFinite(v)) {
							push(`${path}.highlight.opacity: must be a number; ignored.`)
						} else if (v < 0 || v > 1) {
							push(`${path}.highlight.opacity: must be between 0 and 1; clamped.`)
						}
					}
				}
			}
		}
		if (
			(kind === 'repliesList' || kind === 'repliesListRootPost') &&
			(rawNode as any).rootRoot != null
		) {
			analyzeRenderTreeNode(
				(rawNode as any).rootRoot,
				`${path}.rootRoot`,
				state,
				depth + 1,
				assetsById,
			)
		}
		if (
			(kind === 'repliesList' || kind === 'repliesListReplies') &&
			(rawNode as any).itemRoot != null
		) {
			analyzeRenderTreeNode(
				(rawNode as any).itemRoot,
				`${path}.itemRoot`,
				state,
				depth + 1,
				assetsById,
			)
		}
		const wrapItemRoot = (rawNode as any).wrapItemRoot
		if (wrapItemRoot != null) {
			if (kind !== 'repliesList' && kind !== 'repliesListReplies') {
				push(
					`${path}.wrapItemRoot is ignored unless kind='repliesList' or kind='repliesListReplies'.`,
				)
			} else if (typeof wrapItemRoot !== 'boolean') {
				push(`${path}.wrapItemRoot: must be boolean; ignored.`)
			} else if ((rawNode as any).itemRoot == null) {
				push(`${path}.wrapItemRoot is ignored unless itemRoot is provided.`)
			}
		}
		const wrapRootRoot = (rawNode as any).wrapRootRoot
		if (wrapRootRoot != null) {
			if (kind !== 'repliesList' && kind !== 'repliesListRootPost') {
				push(
					`${path}.wrapRootRoot is ignored unless kind='repliesList' or kind='repliesListRootPost'.`,
				)
			} else if (typeof wrapRootRoot !== 'boolean') {
				push(`${path}.wrapRootRoot: must be boolean; ignored.`)
			} else if ((rawNode as any).rootRoot == null) {
				push(`${path}.wrapRootRoot is ignored unless rootRoot is provided.`)
			}
		}
		if (
			kind !== 'repliesList' &&
			kind !== 'repliesListRootPost' &&
			(rawNode as any).rootRoot != null
		) {
			push(
				`${path}.rootRoot is ignored unless kind='repliesList' or kind='repliesListRootPost'.`,
			)
		}
		if (
			kind !== 'repliesList' &&
			kind !== 'repliesListReplies' &&
			(rawNode as any).itemRoot != null
		) {
			push(
				`${path}.itemRoot is ignored unless kind='repliesList' or kind='repliesListReplies'.`,
			)
		}
		return
	}

	if (type === 'Background') {
		warnUnknownKeys(new Set(['type', 'color', 'assetId', 'opacity', 'blur']))
		const color = (rawNode as any).color
		const assetId = (rawNode as any).assetId
		if (
			color == null &&
			(assetId == null || (typeof assetId === 'string' && !assetId.trim()))
		) {
			push(`${path}: Background needs 'color' or 'assetId'; ignored.`)
			return
		}
		if (color != null && (typeof color !== 'string' || !color.trim())) {
			push(`${path}.color: must be a non-empty string; ignored.`)
		} else if (typeof color === 'string' && containsUnsafeCssUrl(color.trim())) {
			push(`${path}.color: url()/http(s)/ext: are not allowed; ignored.`)
		}
		if (assetId != null) {
			if (typeof assetId !== 'string' || !assetId.trim()) {
				push(`${path}.assetId: must be a non-empty string; ignored.`)
			} else {
				const id = assetId.trim()
				if (
					id.startsWith('ext:') ||
					id.startsWith('http://') ||
					id.startsWith('https://')
				) {
					push(
						`${path}.assetId: external URLs are not allowed; use ingest to create a thread asset ID.`,
					)
				} else if (assetsById) {
					const asset = assetsById.get(id)
					if (!asset) {
						push(
							`${path}.assetId: not found in this thread's assets list (may need ingest).`,
						)
					} else if (asset?.status && asset.status !== 'ready') {
						push(
							`${path}.assetId: asset status=${String(asset.status)} (may not be usable yet).`,
						)
					} else if (!asset?.storageKey) {
						push(
							`${path}.assetId: asset has no storageKey (may not be usable yet).`,
						)
					}
				}
			}
		}
		const opacity = (rawNode as any).opacity
		if (opacity != null) {
			if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
				push(`${path}.opacity: must be a number; ignored.`)
			} else if (opacity < 0 || opacity > 1) {
				push(`${path}.opacity: must be between 0 and 1; clamped.`)
			}
		}
		const blur = (rawNode as any).blur
		if (blur != null) {
			if (typeof blur !== 'number' || !Number.isFinite(blur)) {
				push(`${path}.blur: must be a number; ignored.`)
			} else if (blur < 0 || blur > 80) {
				push(`${path}.blur: must be between 0 and 80; clamped.`)
			}
		}
		return
	}

	if (type === 'Text') {
		warnUnknownKeys(
			new Set([
				'type',
				'text',
				'bind',
				'color',
				'align',
				'size',
				'weight',
				'lineHeight',
				'letterSpacing',
				'uppercase',
				'maxLines',
			]),
		)
		const text = (rawNode as any).text
		const bind = (rawNode as any).bind
		const bindAllowed =
			bind === 'thread.title' ||
			bind === 'thread.source' ||
			bind === 'thread.sourceUrl' ||
			bind === 'timeline.replyIndicator' ||
			bind === 'timeline.replyIndex' ||
			bind === 'timeline.replyCount' ||
			bind === 'root.author.name' ||
			bind === 'root.author.handle' ||
			bind === 'root.plainText' ||
			bind === 'post.author.name' ||
			bind === 'post.author.handle' ||
			bind === 'post.plainText'
		if (text == null && bind == null) {
			push(`${path}: Text node needs 'text' or 'bind'; ignored.`)
		} else if (bind != null && !bindAllowed) {
			push(`${path}.bind: unsupported (${String(bind)}); ignored.`)
		}
		const uppercase = (rawNode as any).uppercase
		if (uppercase != null && typeof uppercase !== 'boolean') {
			push(`${path}.uppercase: must be boolean; ignored.`)
		}
		const lineHeight = (rawNode as any).lineHeight
		if (lineHeight != null) {
			if (typeof lineHeight !== 'number' || !Number.isFinite(lineHeight)) {
				push(`${path}.lineHeight: must be a number; ignored.`)
			} else if (lineHeight < 0.8 || lineHeight > 2) {
				push(`${path}.lineHeight: must be between 0.8 and 2; clamped.`)
			}
		}
		const letterSpacing = (rawNode as any).letterSpacing
		if (letterSpacing != null) {
			if (typeof letterSpacing !== 'number' || !Number.isFinite(letterSpacing)) {
				push(`${path}.letterSpacing: must be a number; ignored.`)
			} else if (letterSpacing < -0.2 || letterSpacing > 1) {
				push(`${path}.letterSpacing: must be between -0.2 and 1; clamped.`)
			}
		}
		return
	}

	if (type === 'Metrics') {
		warnUnknownKeys(new Set(['type', 'bind', 'color', 'size', 'showIcon']))
		const bind = (rawNode as any).bind
		if (
			bind != null &&
			bind !== 'root.metrics.likes' &&
			bind !== 'post.metrics.likes'
		) {
			push(
				`${path}.bind: must be 'root.metrics.likes' or 'post.metrics.likes'; ignored.`,
			)
		}
		const showIcon = (rawNode as any).showIcon
		if (showIcon != null && typeof showIcon !== 'boolean') {
			push(`${path}.showIcon: must be boolean; ignored.`)
		}
		const size = (rawNode as any).size
		if (size != null) {
			if (typeof size !== 'number' || !Number.isFinite(size)) {
				push(`${path}.size: must be a number; ignored.`)
			} else if (size < 10 || size > 64) {
				push(`${path}.size: must be between 10 and 64; clamped.`)
			}
		}
		return
	}

	if (type === 'Watermark') {
		warnUnknownKeys(
			new Set([
				'type',
				'text',
				'position',
				'color',
				'size',
				'weight',
				'opacity',
				'padding',
			]),
		)
		const text = (rawNode as any).text
		if (text != null && (typeof text !== 'string' || !text.trim())) {
			push(`${path}.text: must be a non-empty string when provided; ignored.`)
		}
		const position = (rawNode as any).position
		if (
			position != null &&
			position !== 'top-left' &&
			position !== 'top-right' &&
			position !== 'bottom-left' &&
			position !== 'bottom-right'
		) {
			push(
				`${path}.position: must be 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; ignored.`,
			)
		}
		const opacity = (rawNode as any).opacity
		if (opacity != null) {
			if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
				push(`${path}.opacity: must be a number; ignored.`)
			} else if (opacity < 0 || opacity > 1) {
				push(`${path}.opacity: must be between 0 and 1; clamped.`)
			}
		}
		const size = (rawNode as any).size
		if (size != null) {
			if (typeof size !== 'number' || !Number.isFinite(size)) {
				push(`${path}.size: must be a number; ignored.`)
			} else if (size < 8 || size > 64) {
				push(`${path}.size: must be between 8 and 64; clamped.`)
			}
		}
		const weight = (rawNode as any).weight
		if (weight != null) {
			if (typeof weight !== 'number' || !Number.isFinite(weight)) {
				push(`${path}.weight: must be a number; ignored.`)
			} else if (weight < 200 || weight > 900) {
				push(`${path}.weight: must be between 200 and 900; clamped.`)
			}
		}
		const padding = (rawNode as any).padding
		if (padding != null) {
			if (typeof padding !== 'number' || !Number.isFinite(padding)) {
				push(`${path}.padding: must be a number; ignored.`)
			} else if (padding < 0 || padding > 120) {
				push(`${path}.padding: must be between 0 and 120; clamped.`)
			}
		}
		return
	}

	if (type === 'Avatar') {
		warnUnknownKeys(
			new Set(['type', 'bind', 'size', 'radius', 'border', 'background']),
		)
		const bind = (rawNode as any).bind
		if (
			bind !== 'root.author.avatarAssetId' &&
			bind !== 'post.author.avatarAssetId'
		) {
			push(
				`${path}.bind: must be 'root.author.avatarAssetId' or 'post.author.avatarAssetId'; ignored.`,
			)
		}
		const background = (rawNode as any).background
		if (background != null && (typeof background !== 'string' || !background.trim())) {
			push(`${path}.background: must be a non-empty string when provided; ignored.`)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		return
	}

	if (type === 'ContentBlocks') {
		warnUnknownKeys(new Set(['type', 'bind', 'gap', 'maxHeight']))
		const bind = (rawNode as any).bind
		if (bind !== 'root.contentBlocks' && bind !== 'post.contentBlocks') {
			push(
				`${path}.bind: must be 'root.contentBlocks' or 'post.contentBlocks'; ignored.`,
			)
		}
		return
	}

	if (type === 'Image') {
		warnUnknownKeys(
			new Set([
				'type',
				'assetId',
				'fit',
				'width',
				'height',
				'radius',
				'border',
				'background',
			]),
		)
		const assetId = (rawNode as any).assetId
		if (typeof assetId !== 'string' || !assetId.trim()) {
			push(`${path}.assetId: must be a non-empty string; ignored.`)
			return
		}
		const id = assetId.trim()
		if (id === IMAGE_ASSET_ID_PLACEHOLDER) {
			push(
				`${path}.assetId: replace ${IMAGE_ASSET_ID_PLACEHOLDER} with a real image asset id.`,
			)
		} else if (
			id.startsWith('ext:') ||
			id.startsWith('http://') ||
			id.startsWith('https://')
		) {
			push(
				`${path}.assetId: external URLs are not allowed; use ingest to create a thread asset ID.`,
			)
		} else if (assetsById) {
			const asset = assetsById.get(id)
			if (!asset) {
				push(
					`${path}.assetId: not found in this thread's assets list (may need ingest).`,
				)
			} else if (asset?.status && asset.status !== 'ready') {
				push(
					`${path}.assetId: asset status=${String(asset.status)} (may not be usable yet).`,
				)
			} else if (!asset?.storageKey) {
				push(
					`${path}.assetId: asset has no storageKey (may not be usable yet).`,
				)
			}
		}
		const fit = (rawNode as any).fit
		if (fit != null && fit !== 'cover' && fit !== 'contain') {
			push(`${path}.fit: must be 'cover' or 'contain'; ignored.`)
		}
		const background = (rawNode as any).background
		if (background != null && (typeof background !== 'string' || !background.trim())) {
			push(`${path}.background: must be a non-empty string when provided; ignored.`)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		return
	}

	if (type === 'Video') {
		warnUnknownKeys(
			new Set([
				'type',
				'assetId',
				'fit',
				'width',
				'height',
				'radius',
				'border',
				'background',
			]),
		)
		const assetId = (rawNode as any).assetId
		if (typeof assetId !== 'string' || !assetId.trim()) {
			push(`${path}.assetId: must be a non-empty string; ignored.`)
			return
		}
		const id = assetId.trim()
		if (id === VIDEO_ASSET_ID_PLACEHOLDER) {
			push(
				`${path}.assetId: replace ${VIDEO_ASSET_ID_PLACEHOLDER} with a real video asset id.`,
			)
		} else if (
			id.startsWith('ext:') ||
			id.startsWith('http://') ||
			id.startsWith('https://')
		) {
			push(
				`${path}.assetId: external URLs are not allowed; use ingest to create a thread asset ID.`,
			)
		} else if (assetsById) {
			const asset = assetsById.get(id)
			if (!asset) {
				push(
					`${path}.assetId: not found in this thread's assets list (may need ingest).`,
				)
			} else if (asset?.status && asset.status !== 'ready') {
				push(
					`${path}.assetId: asset status=${String(asset.status)} (may not be usable yet).`,
				)
			} else if (!asset?.storageKey) {
				push(
					`${path}.assetId: asset has no storageKey (may not be usable yet).`,
				)
			}
		}
		const fit = (rawNode as any).fit
		if (fit != null && fit !== 'cover' && fit !== 'contain') {
			push(`${path}.fit: must be 'cover' or 'contain'; ignored.`)
		}
		const background = (rawNode as any).background
		if (background != null && (typeof background !== 'string' || !background.trim())) {
			push(`${path}.background: must be a non-empty string when provided; ignored.`)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		return
	}

	if (type === 'Spacer') {
		warnUnknownKeys(new Set(['type', 'axis', 'size', 'width', 'height']))
		const axis = (rawNode as any).axis
		if (axis != null && axis !== 'x' && axis !== 'y') {
			push(`${path}.axis: must be 'x' or 'y'; ignored.`)
		}
		const size = (rawNode as any).size
		const width = (rawNode as any).width
		const height = (rawNode as any).height
		const hasSome =
			(typeof size === 'number' && Number.isFinite(size)) ||
			(typeof width === 'number' && Number.isFinite(width)) ||
			(typeof height === 'number' && Number.isFinite(height))
		if (!hasSome) {
			push(`${path}: Spacer needs one of: size, width, height; ignored.`)
		}
		return
	}

	if (type === 'Divider') {
		warnUnknownKeys(
			new Set([
				'type',
				'axis',
				'thickness',
				'length',
				'color',
				'opacity',
				'margin',
			]),
		)
		const axis = (rawNode as any).axis
		if (axis != null && axis !== 'x' && axis !== 'y') {
			push(`${path}.axis: must be 'x' or 'y'; ignored.`)
		}
		const opacity = (rawNode as any).opacity
		if (opacity != null) {
			if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
				push(`${path}.opacity: must be a number; ignored.`)
			} else if (opacity < 0 || opacity > 1) {
				push(`${path}.opacity: must be between 0 and 1; clamped.`)
			}
		}
		return
	}

	if (type === 'Grid') {
		warnUnknownKeys(
			new Set([
				'type',
				'flex',
				'columns',
				'align',
				'justify',
				'gap',
				'gapX',
				'gapY',
				'padding',
				'paddingX',
				'paddingY',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
		)
		warnFlexProp()
		warnSizeProps()
		warnSpaceProps(
			['gap', 'gapX', 'gapY', 'padding', 'paddingX', 'paddingY'],
			0,
			240,
		)
		const align = (rawNode as any).align
		if (
			align != null &&
			align !== 'start' &&
			align !== 'center' &&
			align !== 'end' &&
			align !== 'stretch'
		) {
			push(
				`${path}.align: must be 'start' | 'center' | 'end' | 'stretch'; ignored.`,
			)
		}
		const justify = (rawNode as any).justify
		if (
			justify != null &&
			justify !== 'start' &&
			justify !== 'center' &&
			justify !== 'end' &&
			justify !== 'stretch'
		) {
			push(
				`${path}.justify: must be 'start' | 'center' | 'end' | 'stretch'; ignored.`,
			)
		}
		const children = (rawNode as any).children
		if (children != null && !Array.isArray(children)) {
			push(`${path}.children: must be an array; ignored.`)
			return
		}
		const list = Array.isArray(children) ? children : []
		for (let i = 0; i < list.length; i += 1) {
			analyzeRenderTreeNode(
				list[i],
				`${path}.children[${i}]`,
				state,
				depth + 1,
				assetsById,
			)
		}
		return
	}

	if (type === 'Absolute') {
		warnUnknownKeys(new Set(['type', 'x', 'y', 'width', 'height', 'children']))
		const children = (rawNode as any).children
		if (children != null && !Array.isArray(children)) {
			push(`${path}.children: must be an array; ignored.`)
			return
		}
		const list = Array.isArray(children) ? children : []
		for (let i = 0; i < list.length; i += 1) {
			analyzeRenderTreeNode(
				list[i],
				`${path}.children[${i}]`,
				state,
				depth + 1,
				assetsById,
			)
		}
		return
	}

	if (type === 'Stack') {
		warnUnknownKeys(
			new Set([
				'type',
				'flex',
				'direction',
				'align',
				'justify',
				'gap',
				'gapX',
				'gapY',
				'padding',
				'paddingX',
				'paddingY',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
		)
		warnFlexProp()
		warnSizeProps()
		warnSpaceProps(
			['gap', 'gapX', 'gapY', 'padding', 'paddingX', 'paddingY'],
			0,
			240,
		)
		const children = (rawNode as any).children
		if (children != null && !Array.isArray(children)) {
			push(`${path}.children: must be an array; ignored.`)
			return
		}
		const list = Array.isArray(children) ? children : []
		for (let i = 0; i < list.length; i += 1) {
			analyzeRenderTreeNode(
				list[i],
				`${path}.children[${i}]`,
				state,
				depth + 1,
				assetsById,
			)
		}
		return
	}

	if (type === 'Box') {
		warnUnknownKeys(
			new Set([
				'type',
				'flex',
				'padding',
				'paddingX',
				'paddingY',
				'border',
				'borderWidth',
				'borderColor',
				'background',
				'radius',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
		)
		warnFlexProp()
		warnSizeProps()
		warnSpaceProps(['padding', 'paddingX', 'paddingY'], 0, 240)
		const borderWidth = (rawNode as any).borderWidth
		if (borderWidth != null) {
			if (typeof borderWidth !== 'number' || !Number.isFinite(borderWidth)) {
				push(`${path}.borderWidth: must be a number; ignored.`)
			} else if (borderWidth < 1 || borderWidth > 12) {
				push(`${path}.borderWidth: must be between 1 and 12; clamped.`)
			}
			if ((rawNode as any).border !== true) {
				push(`${path}.borderWidth is ignored unless border=true.`)
			}
		}
		const borderColor = (rawNode as any).borderColor
		if (borderColor != null) {
			if (
				borderColor !== 'border' &&
				borderColor !== 'primary' &&
				borderColor !== 'muted' &&
				borderColor !== 'accent'
			) {
				push(
					`${path}.borderColor: must be 'border' | 'primary' | 'muted' | 'accent'; ignored.`,
				)
			}
			if ((rawNode as any).border !== true) {
				push(`${path}.borderColor is ignored unless border=true.`)
			}
		}
		const background = (rawNode as any).background
		if (background != null && (typeof background !== 'string' || !background.trim())) {
			push(`${path}.background: must be a non-empty string when provided; ignored.`)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		const children = (rawNode as any).children
		if (children != null && !Array.isArray(children)) {
			push(`${path}.children: must be an array; ignored.`)
			return
		}
		const list = Array.isArray(children) ? children : []
		for (let i = 0; i < list.length; i += 1) {
			analyzeRenderTreeNode(
				list[i],
				`${path}.children[${i}]`,
				state,
				depth + 1,
				assetsById,
			)
		}
		return
	}
}

function analyzeThreadTemplateConfig(
	raw: unknown,
	normalized: ThreadTemplateConfigV1,
	assetsById?: Map<string, any>,
): string[] {
	const issues: string[] = []
	if (raw == null) return issues
	if (!isPlainObject(raw)) {
		issues.push(
			`Config should be an object; got ${Array.isArray(raw) ? 'array' : typeof raw}. It will be treated as defaults.`,
		)
		return issues
	}

	const allowedTop = new Set([
		'version',
		'theme',
		'typography',
		'layout',
		'brand',
		'motion',
		'scenes',
	])
	for (const k of Object.keys(raw)) {
		if (!allowedTop.has(k)) issues.push(`Ignored field: ${k}`)
	}

	if (!('version' in raw)) {
		issues.push('Missing required field: version (must be 1).')
	} else if (raw.version !== 1) {
		issues.push('version must be 1; other values are ignored.')
	}

	const theme = isPlainObject(raw.theme)
		? raw.theme
		: raw.theme == null
			? null
			: 'invalid'
	if (theme === 'invalid') issues.push('theme must be an object; ignored.')
	if (theme && isPlainObject(normalized.theme)) {
		const allowed = new Set([
			'background',
			'surface',
			'border',
			'textPrimary',
			'textSecondary',
			'textMuted',
			'accent',
			'accentGlow',
		])
		for (const k of Object.keys(theme)) {
			if (!allowed.has(k)) issues.push(`Ignored field: theme.${k}`)
		}
		for (const k of allowed) {
			if (!(k in theme)) continue
			const v = (theme as any)[k]
			if (typeof v !== 'string' || !v.trim()) {
				issues.push(`theme.${k} must be a non-empty string; ignored.`)
				continue
			}
			if (containsUnsafeCssUrl(v.trim())) {
				issues.push(`theme.${k} cannot contain url()/http(s)/ext:; ignored.`)
				continue
			}
			const next = (normalized.theme as any)[k]
			if (typeof next === 'string' && next !== v.trim()) {
				issues.push(`theme.${k} normalized (trimmed/truncated).`)
			}
		}
	}

	const typography = isPlainObject(raw.typography)
		? raw.typography
		: raw.typography == null
			? null
			: 'invalid'
	if (typography === 'invalid')
		issues.push('typography must be an object; ignored.')
	if (typography && isPlainObject(normalized.typography)) {
		const allowed = new Set(['fontPreset', 'fontScale'])
		for (const k of Object.keys(typography)) {
			if (!allowed.has(k)) issues.push(`Ignored field: typography.${k}`)
		}
		if ('fontPreset' in typography) {
			const v = (typography as any).fontPreset
			if (v !== 'noto' && v !== 'inter' && v !== 'system') {
				issues.push(
					'typography.fontPreset must be one of: noto, inter, system; ignored.',
				)
			}
		}
		if ('fontScale' in typography) {
			const v = (typography as any).fontScale
			const next = (normalized.typography as any).fontScale
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				issues.push('typography.fontScale must be a number; ignored.')
			} else if (typeof next === 'number' && next !== v) {
				issues.push(`typography.fontScale clamped to ${next}.`)
			}
		}
	}

	const layout = isPlainObject(raw.layout)
		? raw.layout
		: raw.layout == null
			? null
			: 'invalid'
	if (layout === 'invalid') issues.push('layout must be an object; ignored.')
	if (layout && isPlainObject(normalized.layout)) {
		const allowed = new Set(['paddingX', 'paddingY', 'infoPanelWidth'])
		for (const k of Object.keys(layout)) {
			if (!allowed.has(k)) issues.push(`Ignored field: layout.${k}`)
		}
		for (const k of ['paddingX', 'paddingY', 'infoPanelWidth'] as const) {
			if (!(k in layout)) continue
			const v = (layout as any)[k]
			const next = (normalized.layout as any)[k]
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				issues.push(`layout.${k} must be a number; ignored.`)
				continue
			}
			if (typeof next === 'number' && next !== Math.round(v)) {
				issues.push(`layout.${k} clamped to ${next}.`)
			}
		}
	}

	const brand = isPlainObject(raw.brand)
		? raw.brand
		: raw.brand == null
			? null
			: 'invalid'
	if (brand === 'invalid') issues.push('brand must be an object; ignored.')
	if (brand && isPlainObject(normalized.brand)) {
		const allowed = new Set(['showWatermark', 'watermarkText'])
		for (const k of Object.keys(brand)) {
			if (!allowed.has(k)) issues.push(`Ignored field: brand.${k}`)
		}
		if ('showWatermark' in brand) {
			const v = (brand as any).showWatermark
			if (typeof v !== 'boolean')
				issues.push('brand.showWatermark must be boolean; ignored.')
		}
		if ('watermarkText' in brand) {
			const v = (brand as any).watermarkText
			const next = (normalized.brand as any).watermarkText
			if (typeof v !== 'string') {
				issues.push('brand.watermarkText must be string; ignored.')
			} else if (typeof next === 'string' && next !== v.trim()) {
				issues.push('brand.watermarkText normalized (trimmed/truncated).')
			}
		}
	}

	const motion = isPlainObject(raw.motion)
		? raw.motion
		: raw.motion == null
			? null
			: 'invalid'
	if (motion === 'invalid') issues.push('motion must be an object; ignored.')
	if (motion && isPlainObject(normalized.motion)) {
		const allowed = new Set(['enabled', 'intensity'])
		for (const k of Object.keys(motion)) {
			if (!allowed.has(k)) issues.push(`Ignored field: motion.${k}`)
		}
		if ('enabled' in motion) {
			const v = (motion as any).enabled
			if (typeof v !== 'boolean')
				issues.push('motion.enabled must be boolean; ignored.')
		}
		if ('intensity' in motion) {
			const v = (motion as any).intensity
			if (v !== 'subtle' && v !== 'normal' && v !== 'strong') {
				issues.push(
					'motion.intensity must be one of: subtle, normal, strong; ignored.',
				)
			}
		}
	}

	const scenes = isPlainObject(raw.scenes)
		? raw.scenes
		: raw.scenes == null
			? null
			: 'invalid'
	if (scenes === 'invalid') issues.push('scenes must be an object; ignored.')
	if (scenes && isPlainObject((normalized as any).scenes)) {
		const allowedScenes = new Set(['cover', 'post'])
		for (const k of Object.keys(scenes)) {
			if (!allowedScenes.has(k)) issues.push(`Ignored field: scenes.${k}`)
		}

		for (const sceneKey of ['cover', 'post'] as const) {
			const scene = (scenes as any)[sceneKey]
			if (scene == null) continue
			if (!isPlainObject(scene)) {
				issues.push(`scenes.${sceneKey} must be an object; ignored.`)
				continue
			}
			const allowedSceneKeys = new Set(['root'])
			for (const k of Object.keys(scene)) {
				if (!allowedSceneKeys.has(k))
					issues.push(`Ignored field: scenes.${sceneKey}.${k}`)
			}
			if ('root' in scene) {
				const state = { issues: [] as string[], nodeCount: 0, truncated: false }
				analyzeRenderTreeNode(
					(scene as any).root,
					`scenes.${sceneKey}.root`,
					state,
					0,
					assetsById,
				)
				issues.push(...state.issues)
			}
		}
	}

	return issues
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

	const dataQuery = useQuery(
		queryOrpc.thread.byId.queryOptions({ input: { id } }),
	)
	const thread = dataQuery.data?.thread ?? null
	const root = dataQuery.data?.root ?? null
	const replies = dataQuery.data?.replies ?? []
	const assets = dataQuery.data?.assets ?? []
	const audio = dataQuery.data?.audio ?? null
	const audioAssets = dataQuery.data?.audioAssets ?? []

	const [selectedPostId, setSelectedPostId] = React.useState<string | null>(
		null,
	)
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
	const threadJson = React.useMemo(
		() => (thread ? toPrettyJson(thread) : ''),
		[thread],
	)
	const assetsById = React.useMemo(() => {
		const m = new Map<string, any>()
		for (const a of assets) m.set(String(a.id), a)
		return m
	}, [assets])

	const hasExternalMediaRefs = React.useMemo(() => {
		const posts = [root, ...replies].filter(Boolean) as any[]
		for (const p of posts) {
			const avatar = String(p?.authorAvatarAssetId ?? '')
			if (
				avatar.startsWith('ext:') ||
				avatar.startsWith('http://') ||
				avatar.startsWith('https://')
			) {
				return true
			}
			for (const b of (p?.contentBlocks ?? []) as any[]) {
				if (!b || typeof b !== 'object') continue
				if (b.type === 'image' || b.type === 'video') {
					const id = String((b as any).data?.assetId ?? '')
					if (
						id.startsWith('ext:') ||
						id.startsWith('http://') ||
						id.startsWith('https://')
					) {
						return true
					}
				}
				if (b.type === 'link') {
					const id = String((b as any).data?.previewAssetId ?? '')
					if (
						id.startsWith('ext:') ||
						id.startsWith('http://') ||
						id.startsWith('https://')
					) {
						return true
					}
				}
			}
		}
		return false
	}, [replies, root])

	const canIngestAssets = React.useMemo(() => {
		const hasPendingDbAssets = assets.some(
			(a: any) =>
				a?.status === 'pending' || (a?.status === 'ready' && !a?.storageKey),
		)
		return hasExternalMediaRefs || hasPendingDbAssets
	}, [assets, hasExternalMediaRefs])

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
					if (s === 'completed' || s === 'failed' || s === 'canceled')
						return false
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
	const setTemplateMutation = useEnhancedMutation(
		queryOrpc.thread.setTemplate.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: 'Saved template settings',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	async function refreshThread() {
		await qc.invalidateQueries({
			queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
		})
	}

	async function setThreadAudio(audioAssetId: string | null) {
		await setAudioAssetMutation.mutateAsync({ threadId: id, audioAssetId })
		await refreshThread()
		toast.success(
			audioAssetId ? t('audio.toasts.set') : t('audio.toasts.cleared'),
		)
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
				throw new Error(
					`Upload failed: ${putRes.status} ${await putRes.text()}`,
				)
			}

			const durationMs = await readAudioDurationMs(file)
			await completeAudioUploadMutation.mutateAsync({
				threadId: id,
				assetId,
				bytes: file.size,
				durationMs,
			})

			await setAudioAssetMutation.mutateAsync({
				threadId: id,
				audioAssetId: assetId,
			})
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

	// ---------- Thread template ----------
	const templates = React.useMemo(() => listThreadTemplates(), [])
	const TEMPLATE_DEFAULT = '__default__'

	const [templateIdDraft, setTemplateIdDraft] =
		React.useState<string>(TEMPLATE_DEFAULT)
	const [templateConfigText, setTemplateConfigText] = React.useState<string>('')
	const templateConfigTextAreaRef = React.useRef<HTMLTextAreaElement | null>(
		null,
	)

	function suggestMediaHeight(
		kind: 'image' | 'video',
		width: unknown,
		height: unknown,
	) {
		const w = typeof width === 'number' && Number.isFinite(width) ? width : null
		const h =
			typeof height === 'number' && Number.isFinite(height) ? height : null
		if (!w || !h) return kind === 'video' ? 360 : 320
		const ratio = w / h
		if (kind === 'video') {
			if (ratio >= 1.6) return 260
			if (ratio <= 0.8) return 420
			return 360
		}
		if (ratio >= 1.6) return 220
		if (ratio <= 0.8) return 420
		return 320
	}

	function insertTemplateText(snippet: string) {
		const el = templateConfigTextAreaRef.current
		const text = templateConfigText

		if (!el) {
			setTemplateConfigText(text ? `${text}\n${snippet}` : snippet)
			return
		}

		const start =
			typeof el.selectionStart === 'number' ? el.selectionStart : text.length
		const end =
			typeof el.selectionEnd === 'number' ? el.selectionEnd : text.length
		const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`

		setTemplateConfigText(next)
		requestAnimationFrame(() => {
			el.focus()
			const pos = start + snippet.length
			el.selectionStart = pos
			el.selectionEnd = pos
		})
	}

	function replaceAssetIdPlaceholder(
		assetId: string,
		kind?: 'image' | 'video' | null,
	): boolean {
		const order =
			kind === 'image'
				? [IMAGE_ASSET_ID_PLACEHOLDER, VIDEO_ASSET_ID_PLACEHOLDER]
				: kind === 'video'
					? [VIDEO_ASSET_ID_PLACEHOLDER, IMAGE_ASSET_ID_PLACEHOLDER]
					: [IMAGE_ASSET_ID_PLACEHOLDER, VIDEO_ASSET_ID_PLACEHOLDER]

		for (const placeholder of order) {
			if (!templateConfigText.includes(placeholder)) continue
			setTemplateConfigText(templateConfigText.replace(placeholder, assetId))
			return true
		}
		return false
	}

	React.useEffect(() => {
		if (!thread) return
		const nextTemplateId = thread.templateId
			? String(thread.templateId)
			: TEMPLATE_DEFAULT
		setTemplateIdDraft(nextTemplateId)
		setTemplateConfigText(
			thread.templateConfig == null ? '' : toPrettyJson(thread.templateConfig),
		)
	}, [thread?.id])

	const templateConfigParsed = React.useMemo(() => {
		const text = templateConfigText.trim()
		if (!text) return { value: null as unknown, error: null as string | null }
		try {
			return {
				value: JSON.parse(text) as unknown,
				error: null as string | null,
			}
		} catch (e) {
			return {
				value: undefined,
				error: e instanceof Error ? e.message : String(e),
			}
		}
	}, [templateConfigText])

	const normalizedTemplateConfig = React.useMemo(() => {
		if (templateConfigParsed.value === undefined) return null
		if (templateConfigParsed.value === null)
			return DEFAULT_THREAD_TEMPLATE_CONFIG
		return normalizeThreadTemplateConfig(templateConfigParsed.value)
	}, [templateConfigParsed.value])

	const templateConfigIssues = React.useMemo(() => {
		if (!normalizedTemplateConfig) return []
		if (
			templateConfigParsed.value === undefined ||
			templateConfigParsed.value === null
		) {
			return []
		}
		return analyzeThreadTemplateConfig(
			templateConfigParsed.value,
			normalizedTemplateConfig,
			assetsById,
		)
	}, [assetsById, normalizedTemplateConfig, templateConfigParsed.value])

	const previewTemplateId =
		templateIdDraft === TEMPLATE_DEFAULT
			? thread?.templateId
				? (String(thread.templateId) as any)
				: undefined
			: (templateIdDraft as any)

	const previewTemplateConfig =
		templateConfigParsed.value === undefined
			? (thread?.templateConfig as any)
			: (templateConfigParsed.value as any)

	async function saveTemplateSettings(mode: 'raw' | 'normalized' = 'raw') {
		if (!thread) return
		if (templateConfigParsed.error) {
			toast.error(`Invalid JSON: ${templateConfigParsed.error}`)
			return
		}

		if (mode === 'normalized' && !normalizedTemplateConfig) {
			toast.error('Normalized config is not available')
			return
		}

		if (mode === 'normalized' && !templateConfigText.trim()) {
			toast.error('Nothing to normalize: Config JSON is empty')
			return
		}

		const templateId =
			templateIdDraft === TEMPLATE_DEFAULT ? null : String(templateIdDraft)
		const templateConfig =
			mode === 'normalized'
				? normalizedTemplateConfig
				: templateConfigParsed.value === null
					? null
					: templateConfigParsed.value

		if (
			templateConfig != null &&
			(!isPlainObject(templateConfig) || (templateConfig as any).version !== 1)
		) {
			toast.error('templateConfig must include "version": 1 (v1 only)')
			return
		}

		await setTemplateMutation.mutateAsync({
			threadId: thread.id,
			templateId,
			templateConfig,
		})
	}

	const normalizedTemplateConfigText = React.useMemo(() => {
		if (!normalizedTemplateConfig) return ''
		return toPrettyJson(normalizedTemplateConfig)
	}, [normalizedTemplateConfig])

	const canSaveNormalized =
		Boolean(thread) &&
		!setTemplateMutation.isPending &&
		!templateConfigParsed.error &&
		Boolean(templateConfigText.trim())

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
					templateId={previewTemplateId}
					templateConfig={previewTemplateConfig}
				/>

				<div className="mt-6">
					<div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Template
					</div>
					<Card className="rounded-none">
						<CardContent className="py-5 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										Template ID
									</Label>
									<Select
										value={templateIdDraft}
										onValueChange={(v) => setTemplateIdDraft(v)}
									>
										<SelectTrigger className="w-full rounded-none font-mono text-xs">
											<SelectValue placeholder="Select template" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={TEMPLATE_DEFAULT}>
												Default ({DEFAULT_THREAD_TEMPLATE_ID})
											</SelectItem>
											{templates.map((tpl) => (
												<SelectItem key={tpl.id} value={tpl.id}>
													{tpl.name} ({tpl.id})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										Config JSON
									</Label>
									<Textarea
										ref={templateConfigTextAreaRef}
										value={templateConfigText}
										onChange={(e) => setTemplateConfigText(e.target.value)}
										placeholder="{}"
										className="min-h-[120px] rounded-none font-mono text-xs"
									/>
									{templateConfigParsed.error ? (
										<div className="font-mono text-xs text-destructive">
											Invalid JSON: {templateConfigParsed.error}
										</div>
									) : (
										<div className="font-mono text-xs text-muted-foreground">
											Empty = use defaults
										</div>
									)}
									{!templateConfigParsed.error &&
									templateConfigIssues.length > 0 ? (
										<div className="space-y-1">
											<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												Normalization
											</div>
											<ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
												{templateConfigIssues.slice(0, 12).map((msg, idx) => (
													<li key={idx}>- {msg}</li>
												))}
												{templateConfigIssues.length > 12 ? (
													<li>
														- …and {templateConfigIssues.length - 12} more
													</li>
												) : null}
											</ul>
										</div>
									) : null}
								</div>
							</div>

							<div className="space-y-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Assets (insert)
								</Label>
								<div className="rounded-none border border-border bg-card">
									{assets.length === 0 ? (
										<div className="px-3 py-3 font-mono text-xs text-muted-foreground">
											No referenced assets in this thread yet.
										</div>
									) : (
										<div className="max-h-[260px] overflow-auto">
											{assets
												.slice()
												.sort((a: any, b: any) => {
													const ka = String(a?.kind ?? '')
													const kb = String(b?.kind ?? '')
													if (ka !== kb) return ka.localeCompare(kb)
													return String(a?.id ?? '').localeCompare(
														String(b?.id ?? ''),
													)
												})
												.map((a: any) => (
													<div
														key={String(a.id)}
														className="flex items-start justify-between gap-3 px-3 py-2 border-t border-border first:border-t-0"
													>
														<div className="min-w-0">
															<div className="font-mono text-xs text-foreground">
																{String(a.kind)}{' '}
																<span className="text-muted-foreground">
																	({String(a.status ?? 'unknown')})
																</span>
															</div>
															<div className="font-mono text-[10px] text-muted-foreground break-all">
																{String(a.id)}
															</div>
														</div>
														<div className="flex flex-wrap items-center justify-end gap-2">
															<Button
																type="button"
																size="sm"
																variant="outline"
																className="rounded-none font-mono text-[10px] uppercase"
																onClick={() => {
																	const id = String(a.id)
																	void navigator.clipboard
																		.writeText(id)
																		.then(() =>
																			toast.message('Copied asset id'),
																		)
																		.catch(() =>
																			toast.message(
																				'Copy failed (clipboard not available)',
																			),
																		)

																	const kind =
																		a.kind === 'image' || a.kind === 'video'
																			? (a.kind as 'image' | 'video')
																			: null
																	if (replaceAssetIdPlaceholder(id, kind)) {
																		toast.message('Replaced placeholder')
																		return
																	}
																	insertTemplateText(JSON.stringify(id))
																}}
															>
																Insert ID
															</Button>
															{a.kind === 'image' ? (
																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase"
																	onClick={() => {
																		const id = String(a.id)
																		if (
																			replaceAssetIdPlaceholder(id, 'image')
																		) {
																			toast.message('Replaced placeholder')
																			return
																		}
																		const height = suggestMediaHeight(
																			'image',
																			a.width,
																			a.height,
																		)
																		insertTemplateText(
																			toPrettyJson({
																				type: 'Image',
																				assetId: id,
																				fit: 'cover',
																				height,
																				radius: 12,
																				border: true,
																			}),
																		)
																	}}
																>
																	Insert Image
																</Button>
															) : null}
															{a.kind === 'video' ? (
																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase"
																	onClick={() => {
																		const id = String(a.id)
																		if (
																			replaceAssetIdPlaceholder(id, 'video')
																		) {
																			toast.message('Replaced placeholder')
																			return
																		}
																		const height = suggestMediaHeight(
																			'video',
																			a.width,
																			a.height,
																		)
																		insertTemplateText(
																			toPrettyJson({
																				type: 'Video',
																				assetId: id,
																				fit: 'cover',
																				height,
																				radius: 12,
																				border: true,
																			}),
																		)
																	}}
																>
																	Insert Video
																</Button>
															) : null}
														</div>
													</div>
												))}
										</div>
									)}
								</div>
								<div className="font-mono text-xs text-muted-foreground">
									Tip: `Image/Video.assetId` must be a `thread_assets.id`. Use
									`Download/ingest` first for external media. Placeholders:
									{` ${IMAGE_ASSET_ID_PLACEHOLDER}, ${VIDEO_ASSET_ID_PLACEHOLDER}`}
								</div>
							</div>

							{!templateConfigParsed.error ? (
								<div className="space-y-2">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
										Normalized (preview)
									</Label>
									<Textarea
										value={normalizedTemplateConfigText}
										readOnly
										className="min-h-[120px] rounded-none font-mono text-xs"
									/>
									<div className="font-mono text-xs text-muted-foreground">
										Preview/render uses the normalized config.
									</div>
								</div>
							) : null}

							<div className="flex flex-wrap items-center gap-3">
								<Button
									type="button"
									className="rounded-none font-mono text-xs uppercase"
									disabled={setTemplateMutation.isPending || !thread}
									onClick={() => void saveTemplateSettings('raw')}
								>
									{setTemplateMutation.isPending ? 'Saving…' : 'Save'}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										setTemplateIdDraft(DEFAULT_THREAD_TEMPLATE_ID)
										setTemplateConfigText(
											toPrettyJson(buildRepliesListItemRootExample()),
										)
										toast.message('Inserted example config (replies itemRoot)')
									}}
								>
									Insert Example
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										setTemplateIdDraft(DEFAULT_THREAD_TEMPLATE_ID)
										setTemplateConfigText(toPrettyJson(buildCoverRootExample()))
										toast.message('Inserted example config (cover root)')
									}}
								>
									Insert Cover Example
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										setTemplateIdDraft(DEFAULT_THREAD_TEMPLATE_ID)
										setTemplateConfigText(
											toPrettyJson(buildRepliesListSplitLayoutExample()),
										)
										toast.message(
											'Inserted example config (repliesList split layout)',
										)
									}}
								>
									Insert Replies Layout
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										insertTemplateText(
											toPrettyJson(buildRepliesListHeaderSnippetExample()),
										)
										toast.message('Inserted snippet (replies header)')
									}}
								>
									Insert Header Snippet
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										insertTemplateText(
											toPrettyJson(buildRepliesHighlightSnippetExample()),
										)
										toast.message('Inserted snippet (replies highlight)')
									}}
								>
									Insert Highlight Snippet
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										insertTemplateText(toPrettyJson(buildGridSnippetExample()))
										toast.message('Inserted snippet (Grid)')
									}}
								>
									Insert Grid Snippet
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										insertTemplateText(
											toPrettyJson(buildAbsoluteSnippetExample()),
										)
										toast.message('Inserted snippet (Absolute)')
									}}
								>
									Insert Absolute Snippet
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!canSaveNormalized}
									onClick={() => void saveTemplateSettings('normalized')}
								>
									Save Normalized
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => {
										if (!thread) return
										setTemplateIdDraft(
											thread.templateId
												? String(thread.templateId)
												: TEMPLATE_DEFAULT,
										)
										setTemplateConfigText(
											thread.templateConfig == null
												? ''
												: toPrettyJson(thread.templateConfig),
										)
									}}
								>
									Reset
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={!thread}
									onClick={() => setTemplateConfigText('')}
								>
									Clear Config
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>

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
									{isUploadingAudio
										? t('audio.actions.uploading')
										: t('audio.actions.upload')}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="rounded-none font-mono text-xs uppercase"
									disabled={
										setAudioAssetMutation.isPending || !thread?.audioAssetId
									}
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
								<audio controls src={String(audio.url)} className="w-full" />
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
											const isCurrent =
												thread?.audioAssetId &&
												String(thread.audioAssetId) === String(a.id)
											return (
												<div
													key={String(a.id)}
													className={`border px-3 py-2 font-mono text-xs ${
														isCurrent
															? 'border-primary bg-primary/5'
															: 'border-border bg-muted/30'
													}`}
												>
													<div className="flex flex-wrap items-center justify-between gap-3">
														<div className="truncate">
															{String(a.id)}
															{typeof a.durationMs === 'number'
																? ` · ${Math.round(a.durationMs / 1000)}s`
																: ''}
															{typeof a.bytes === 'number'
																? ` · ${Math.round(a.bytes / 1024)}KB`
																: ''}
															{a.status ? ` · ${String(a.status)}` : ''}
														</div>
														<Button
															type="button"
															size="sm"
															variant="outline"
															className="rounded-none font-mono text-[10px] uppercase tracking-widest"
															disabled={
																setAudioAssetMutation.isPending ||
																String(a.status) !== 'ready'
															}
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
								{canIngestAssets ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-none font-mono text-[10px] uppercase tracking-widest"
										disabled={ingestAssetsMutation.isPending}
										onClick={() =>
											ingestAssetsMutation.mutate({ threadId: id })
										}
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
											asset:{' '}
											{assetsById.get(selectedPost.authorAvatarAssetId).kind}{' '}
											{assetsById.get(selectedPost.authorAvatarAssetId)
												.sourceUrl
												? `url=${assetsById.get(selectedPost.authorAvatarAssetId).sourceUrl}`
												: assetsById.get(selectedPost.authorAvatarAssetId)
															.storageKey
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

							{(selectedPost?.contentBlocks ?? []).filter(
								(b: any) => b?.type !== 'text',
							).length === 0 ? (
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
																asset: kind={asset.kind} bytes=
																{asset.bytes ?? '-'}{' '}
																{asset.width && asset.height
																	? `dim=${asset.width}x${asset.height}`
																	: null}{' '}
																status={asset.status}{' '}
																{asset.storageKey
																	? `storageKey=${asset.storageKey}`
																	: null}
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
															{t('media.labels.link')}:{' '}
															{String(b.data?.url ?? '')}
														</div>
														{b.data?.title ? (
															<div className="text-muted-foreground">
																{t('media.labels.title')}:{' '}
																{String(b.data.title)}
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
																{t('media.labels.previewAssetId')}:{' '}
																{previewAssetId}{' '}
																{previewAsset?.sourceUrl
																	? `url=${previewAsset.sourceUrl}`
																	: null}
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
													{t('media.unknownBlockType', {
														type: String(b.type),
													})}
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
										disabled={
											translateMutation.isPending ||
											!thread?.id ||
											!selectedPost?.id
										}
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
									updateMutation.isPending || !selectedPost?.id || !thread?.id
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
									setDraftText(
										firstTextBlockText(selectedPost?.contentBlocks) || '',
									)
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
											progress: Math.round(
												renderStatusQuery.data.progress * 100,
											),
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
