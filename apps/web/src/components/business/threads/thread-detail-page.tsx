'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, Play, Trash2 } from 'lucide-react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { ThreadRemotionPlayerCard } from '~/components/business/threads/thread-remotion-player-card'
import { ThreadTemplateLibraryCard } from '~/components/business/threads/thread-template-library-card'
import { getUserFriendlyErrorMessage } from '~/lib/shared/errors/client'
import { useCloudJob } from '~/lib/shared/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc'
import { DEFAULT_THREAD_TEMPLATE_ID } from '@app/remotion-project/thread-templates'
import {
	DEFAULT_THREAD_TEMPLATE_CONFIG,
} from '@app/remotion-project/thread-template-config'

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

/*
Legacy thread template editor helpers (examples + config analyzer).
Editing is now done in the dedicated template library editor page.

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
						type: 'RemovedNode',
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

function buildRootPostSnippetExample(): Record<string, unknown> {
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
								type: 'Stack',
								direction: 'column',
								gapY: 2,
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
						type: 'Metrics',
						bind: 'root.metrics.likes',
						color: 'muted',
						size: 14,
						showIcon: true,
					},
				],
			},
			{ type: 'Divider', opacity: 0.6, margin: 0 },
			{
				type: 'ContentBlocks',
				bind: 'root.contentBlocks',
				gap: 12,
				maxHeight: 900,
			},
		],
	}
}

function buildReplyItemSnippetExample(): Record<string, unknown> {
	return {
		type: 'Stack',
		gapY: 12,
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
								bind: 'post.author.avatarAssetId',
								size: 36,
								border: true,
							},
							{
								type: 'Text',
								bind: 'post.author.name',
								size: 14,
								weight: 800,
								maxLines: 1,
							},
						],
					},
					{
						type: 'Metrics',
						bind: 'post.metrics.likes',
						color: 'muted',
						size: 12,
						showIcon: true,
					},
				],
			},
			{ type: 'Divider', opacity: 0.6, margin: 0 },
			{
				type: 'Text',
				bind: 'post.plainText',
				color: 'primary',
				size: 14,
				weight: 600,
				lineHeight: 1.5,
				maxLines: 10,
			},
		],
	}
}

function buildRepeatRepliesSnippetExample(): Record<string, unknown> {
	return {
		type: 'Repeat',
		source: 'replies',
		maxItems: 50,
		wrapItemRoot: true,
		gap: 12,
		highlight: {
			enabled: true,
			color: 'accent',
			thickness: 3,
			radius: 0,
			opacity: 1,
		},
		itemRoot: buildReplyItemSnippetExample(),
	}
}

	function buildRepliesHighlightSnippetExample(): Record<string, unknown> {
		return {
			type: 'RemovedNode',
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

function buildActiveReplySplitLayoutExample(): ThreadTemplateConfigV1 {
	return {
		version: 1,
		typography: { fontPreset: 'noto', fontScale: 1 },
		scenes: {
			post: {
				root: {
					type: 'Stack',
					direction: 'column',
					gapY: 18,
					padding: 64,
					children: [
						buildRepliesListHeaderSnippetExample() as any,
						{
							type: 'Stack',
							direction: 'row',
							align: 'stretch',
							gapX: 22,
							flex: 1,
							children: [
								{
									type: 'Box',
									flex: 58,
									border: true,
									background: 'var(--tf-surface)',
									padding: 28,
									maxHeight: 2000,
									children: [
										buildRootPostSnippetExample() as any,
									],
								},
								{
									type: 'Box',
									flex: 42,
									maxHeight: 2000,
									border: true,
									background: 'rgba(255,255,255,0.02)',
									padding: 18,
									children: [
										buildReplyItemSnippetExample() as any,
									],
								},
							],
						},
					],
				} as any,
			},
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
										type: 'RemovedNode',
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
												type: 'RemovedNode',
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

function buildRepeatRepliesSplitLayoutExample(): ThreadTemplateConfigV1 {
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
										type: 'Box',
										border: true,
										background: 'var(--tf-surface)',
										padding: 28,
										children: [
											{
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
																		type: 'Stack',
																		direction: 'column',
																		gapY: 2,
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
																type: 'Metrics',
																bind: 'root.metrics.likes',
																color: 'muted',
																size: 14,
																showIcon: true,
															},
														],
													},
													{ type: 'Divider', opacity: 0.6, margin: 12 },
													{
														type: 'ContentBlocks',
														bind: 'root.contentBlocks',
														gap: 12,
														maxHeight: 900,
													},
												],
											},
										],
									},
									{
										type: 'Box',
										border: true,
										background: 'rgba(255,255,255,0.02)',
										padding: 18,
										children: [
											{
												type: 'Repeat',
												source: 'replies',
												maxItems: 50,
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
													type: 'Stack',
													gapY: 12,
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
																			bind: 'post.author.avatarAssetId',
																			size: 36,
																			border: true,
																		},
																		{
																			type: 'Text',
																			bind: 'post.author.name',
																			size: 14,
																			weight: 800,
																			maxLines: 1,
																		},
																	],
																},
																{
																	type: 'Metrics',
																	bind: 'post.metrics.likes',
																	color: 'muted',
																	size: 12,
																	showIcon: true,
																},
															],
														},
														{ type: 'Divider', opacity: 0.6, margin: 0 },
														{
															type: 'Text',
															bind: 'post.plainText',
															color: 'primary',
															size: 14,
															weight: 600,
															lineHeight: 1.5,
															maxLines: 10,
														},
													],
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
				type === 'RemovedNode' ||
				type === 'Repeat' ||
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

			if (type === 'RemovedNode') {
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
				if (
					'enabled' in highlight &&
					typeof (highlight as any).enabled !== 'boolean'
				) {
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
							push(
								`${path}.highlight.thickness: must be between 1 and 12; clamped.`,
							)
						}
					}
				}
				if ('radius' in highlight) {
					const v = (highlight as any).radius
					if (v != null) {
						if (typeof v !== 'number' || !Number.isFinite(v)) {
							push(`${path}.highlight.radius: must be a number; ignored.`)
						} else if (v < 0 || v > 48) {
							push(
								`${path}.highlight.radius: must be between 0 and 48; clamped.`,
							)
						}
					}
				}
				if ('opacity' in highlight) {
					const v = (highlight as any).opacity
					if (v != null) {
						if (typeof v !== 'number' || !Number.isFinite(v)) {
							push(`${path}.highlight.opacity: must be a number; ignored.`)
						} else if (v < 0 || v > 1) {
							push(
								`${path}.highlight.opacity: must be between 0 and 1; clamped.`,
							)
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

		if (type === 'Repeat') {
			warnUnknownKeys(
				new Set([
					'type',
					'source',
					'maxItems',
					'gap',
					'wrapItemRoot',
					'scroll',
					'highlight',
					'itemRoot',
				]),
			)

			const source = (rawNode as any).source
			if (source != null && source !== 'replies') {
				push(`${path}.source: must be 'replies'; ignored.`)
				return
			}

			const maxItems = (rawNode as any).maxItems
			if (maxItems != null) {
				if (typeof maxItems !== 'number' || !Number.isFinite(maxItems)) {
					push(`${path}.maxItems: must be a number; ignored.`)
				} else if (maxItems < 1 || maxItems > 100) {
					push(`${path}.maxItems: must be between 1 and 100; clamped.`)
				}
			}

			const gap = (rawNode as any).gap
			if (gap != null) {
				if (typeof gap !== 'number' || !Number.isFinite(gap)) {
					push(`${path}.gap: must be a number; ignored.`)
				} else if (gap < 0 || gap > 80) {
					push(`${path}.gap: must be between 0 and 80; clamped.`)
				}
			}

			for (const k of ['wrapItemRoot', 'scroll'] as const) {
				const v = (rawNode as any)[k]
				if (v == null) continue
				if (typeof v !== 'boolean') push(`${path}.${k}: must be boolean; ignored.`)
			}

			const highlight = (rawNode as any).highlight
			if (highlight != null) {
				if (!isPlainObject(highlight)) {
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
					if (
						'enabled' in highlight &&
						typeof (highlight as any).enabled !== 'boolean'
					) {
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
								push(
									`${path}.highlight.thickness: must be between 1 and 12; clamped.`,
								)
							}
						}
					}
					if ('radius' in highlight) {
						const v = (highlight as any).radius
						if (v != null) {
							if (typeof v !== 'number' || !Number.isFinite(v)) {
								push(`${path}.highlight.radius: must be a number; ignored.`)
							} else if (v < 0 || v > 48) {
								push(
									`${path}.highlight.radius: must be between 0 and 48; clamped.`,
								)
							}
						}
					}
					if ('opacity' in highlight) {
						const v = (highlight as any).opacity
						if (v != null) {
							if (typeof v !== 'number' || !Number.isFinite(v)) {
								push(`${path}.highlight.opacity: must be a number; ignored.`)
							} else if (v < 0 || v > 1) {
								push(
									`${path}.highlight.opacity: must be between 0 and 1; clamped.`,
								)
							}
						}
					}
				}
			}

			analyzeRenderTreeNode(
				(rawNode as any).itemRoot,
				`${path}.itemRoot`,
				state,
				depth + 1,
				assetsById,
			)
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
		} else if (
			typeof color === 'string' &&
			containsUnsafeCssUrl(color.trim())
		) {
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
					'opacity',
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
			const opacity = (rawNode as any).opacity
			if (opacity != null) {
				if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
					push(`${path}.opacity: must be a number; ignored.`)
				} else if (opacity < 0 || opacity > 1) {
					push(`${path}.opacity: must be between 0 and 1; clamped.`)
				}
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
			if (
				typeof letterSpacing !== 'number' ||
				!Number.isFinite(letterSpacing)
			) {
				push(`${path}.letterSpacing: must be a number; ignored.`)
			} else if (letterSpacing < -0.2 || letterSpacing > 1) {
				push(`${path}.letterSpacing: must be between -0.2 and 1; clamped.`)
			}
		}
		return
	}

		if (type === 'Metrics') {
			warnUnknownKeys(new Set(['type', 'bind', 'color', 'opacity', 'size', 'showIcon']))
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
				new Set(['type', 'bind', 'opacity', 'size', 'radius', 'border', 'background']),
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
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
			) {
				push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
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

		if (type === 'ContentBlocks') {
			warnUnknownKeys(new Set(['type', 'bind', 'opacity', 'gap', 'maxHeight']))
			const bind = (rawNode as any).bind
			if (bind !== 'root.contentBlocks' && bind !== 'post.contentBlocks') {
				push(
					`${path}.bind: must be 'root.contentBlocks' or 'post.contentBlocks'; ignored.`,
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
			return
		}

	if (type === 'Image') {
		warnUnknownKeys(
			new Set([
				'type',
				'assetId',
				'fit',
				'position',
				'opacity',
				'blur',
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
		const position = (rawNode as any).position
		if (
			position != null &&
			(typeof position !== 'string' || !position.trim())
		) {
			push(
				`${path}.position: must be a non-empty string when provided; ignored.`,
			)
		}
		const background = (rawNode as any).background
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
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
				'position',
				'opacity',
				'blur',
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
		const position = (rawNode as any).position
		if (
			position != null &&
			(typeof position !== 'string' || !position.trim())
		) {
			push(
				`${path}.position: must be a non-empty string when provided; ignored.`,
			)
		}
		const background = (rawNode as any).background
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
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
					'opacity',
					'columns',
					'align',
					'justify',
					'gap',
					'gapX',
				'gapY',
				'padding',
				'paddingX',
				'paddingY',
				'border',
				'borderWidth',
				'borderColor',
				'background',
				'radius',
				'overflow',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
		)
			warnFlexProp()
			const opacity = (rawNode as any).opacity
			if (opacity != null) {
				if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
					push(`${path}.opacity: must be a number; ignored.`)
				} else if (opacity < 0 || opacity > 1) {
					push(`${path}.opacity: must be between 0 and 1; clamped.`)
				}
			}
			warnSizeProps()
			warnSpaceProps(
				['gap', 'gapX', 'gapY', 'padding', 'paddingX', 'paddingY'],
				0,
				240,
		)
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
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		const radius = (rawNode as any).radius
		if (radius != null) {
			if (typeof radius !== 'number' || !Number.isFinite(radius)) {
				push(`${path}.radius: must be a number; ignored.`)
			} else if (radius < 0 || radius > 120) {
				push(`${path}.radius: must be between 0 and 120; clamped.`)
			}
		}
		const overflow = (rawNode as any).overflow
		if (overflow != null && overflow !== 'hidden') {
			push(`${path}.overflow: must be 'hidden' when provided; ignored.`)
		}
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
			warnUnknownKeys(
				new Set([
					'type',
					'x',
					'y',
					'width',
					'height',
					'zIndex',
					'opacity',
					'pointerEvents',
					'rotate',
					'scale',
					'origin',
					'children',
				]),
			)
			const opacity = (rawNode as any).opacity
			if (opacity != null) {
				if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
					push(`${path}.opacity: must be a number; ignored.`)
				} else if (opacity < 0 || opacity > 1) {
					push(`${path}.opacity: must be between 0 and 1; clamped.`)
				}
			}
			const zIndex = (rawNode as any).zIndex
			if (zIndex != null) {
				if (typeof zIndex !== 'number' || !Number.isFinite(zIndex)) {
					push(`${path}.zIndex: must be a number; ignored.`)
			} else if (zIndex < -100 || zIndex > 100) {
				push(`${path}.zIndex: must be between -100 and 100; clamped.`)
			}
		}
		const pointerEvents = (rawNode as any).pointerEvents
		if (pointerEvents != null && typeof pointerEvents !== 'boolean') {
			push(`${path}.pointerEvents: must be boolean; ignored.`)
		}
		const rotate = (rawNode as any).rotate
		if (rotate != null) {
			if (typeof rotate !== 'number' || !Number.isFinite(rotate)) {
				push(`${path}.rotate: must be a number; ignored.`)
			} else if (rotate < -180 || rotate > 180) {
				push(`${path}.rotate: must be between -180 and 180; clamped.`)
			}
		}
		const scale = (rawNode as any).scale
		if (scale != null) {
			if (typeof scale !== 'number' || !Number.isFinite(scale)) {
				push(`${path}.scale: must be a number; ignored.`)
			} else if (scale < 0.1 || scale > 4) {
				push(`${path}.scale: must be between 0.1 and 4; clamped.`)
			}
		}
		const origin = (rawNode as any).origin
		if (
			origin != null &&
			origin !== 'center' &&
			origin !== 'top-left' &&
			origin !== 'top-right' &&
			origin !== 'bottom-left' &&
			origin !== 'bottom-right'
		) {
			push(
				`${path}.origin: must be 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; ignored.`,
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

		if (type === 'Stack') {
			warnUnknownKeys(
				new Set([
					'type',
					'flex',
					'opacity',
					'direction',
					'align',
					'justify',
					'gap',
					'gapX',
				'gapY',
				'padding',
				'paddingX',
				'paddingY',
				'border',
				'borderWidth',
				'borderColor',
				'background',
				'radius',
				'overflow',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
			)
			warnFlexProp()
			const opacity = (rawNode as any).opacity
			if (opacity != null) {
				if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
					push(`${path}.opacity: must be a number; ignored.`)
				} else if (opacity < 0 || opacity > 1) {
					push(`${path}.opacity: must be between 0 and 1; clamped.`)
				}
			}
			warnSizeProps()
			warnSpaceProps(
				['gap', 'gapX', 'gapY', 'padding', 'paddingX', 'paddingY'],
				0,
			240,
		)
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
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		const radius = (rawNode as any).radius
		if (radius != null) {
			if (typeof radius !== 'number' || !Number.isFinite(radius)) {
				push(`${path}.radius: must be a number; ignored.`)
			} else if (radius < 0 || radius > 120) {
				push(`${path}.radius: must be between 0 and 120; clamped.`)
			}
		}
		const overflow = (rawNode as any).overflow
		if (overflow != null && overflow !== 'hidden') {
			push(`${path}.overflow: must be 'hidden' when provided; ignored.`)
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

		if (type === 'Box') {
			warnUnknownKeys(
				new Set([
					'type',
					'flex',
					'opacity',
					'padding',
					'paddingX',
					'paddingY',
					'border',
				'borderWidth',
				'borderColor',
				'background',
				'radius',
				'overflow',
				'width',
				'height',
				'maxWidth',
				'maxHeight',
				'children',
			]),
			)
			warnFlexProp()
			const opacity = (rawNode as any).opacity
			if (opacity != null) {
				if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
					push(`${path}.opacity: must be a number; ignored.`)
				} else if (opacity < 0 || opacity > 1) {
					push(`${path}.opacity: must be between 0 and 1; clamped.`)
				}
			}
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
		if (
			background != null &&
			(typeof background !== 'string' || !background.trim())
		) {
			push(
				`${path}.background: must be a non-empty string when provided; ignored.`,
			)
		} else if (
			typeof background === 'string' &&
			containsUnsafeCssUrl(background.trim())
		) {
			push(`${path}.background: url()/http(s)/ext: are not allowed; ignored.`)
		}
		const radius = (rawNode as any).radius
		if (radius != null) {
			if (typeof radius !== 'number' || !Number.isFinite(radius)) {
				push(`${path}.radius: must be a number; ignored.`)
			} else if (radius < 0 || radius > 120) {
				push(`${path}.radius: must be between 0 and 120; clamped.`)
			}
		}
		const overflow = (rawNode as any).overflow
		if (overflow != null && overflow !== 'hidden') {
			push(`${path}.overflow: must be 'hidden' when provided; ignored.`)
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

*/

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
			audio.onerror = () => reject(new Error('AUDIO_METADATA_READ_FAILED'))
			audio.src = url
		})

		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new Error('AUDIO_DURATION_INVALID')
		}

		return Math.round(durationSeconds * 1000)
	} finally {
		URL.revokeObjectURL(url)
	}
}

export function ThreadDetailPage({ id }: { id: string }) {
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()
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

	const assetById = React.useMemo(() => {
		const m = new Map<string, any>()
		for (const a of assets as any[]) m.set(String(a.id), a)
		return m
	}, [assets])

	const assetUrlById = React.useMemo(() => {
		const m = new Map<string, string>()
		for (const a of assets as any[]) {
			const id = String(a.id)
			const candidate = String(a?.renderUrl || a?.sourceUrl || '').trim()
			if (
				candidate.startsWith('http://') ||
				candidate.startsWith('https://')
			) {
				m.set(id, candidate)
			}
		}
		return m
	}, [assets])

	const getPostPreviewMedia = React.useCallback(
		(blocks: any[] | null | undefined) => {
			const out: Array<{ kind: 'image' | 'video'; url: string }> = []
			for (const b of (blocks ?? []) as any[]) {
				if (!b || typeof b !== 'object') continue
				if (out.length >= 3) break

				if (b.type === 'image') {
					const rawId = String((b as any).data?.assetId ?? '').trim()
					if (!rawId) continue
					const extUrl = rawId.startsWith('ext:') ? rawId.slice(4).trim() : null
					const url =
						(extUrl &&
							(extUrl.startsWith('http://') || extUrl.startsWith('https://'))
							? extUrl
							: null) ||
						(rawId.startsWith('http://') || rawId.startsWith('https://')
							? rawId
							: null) ||
						assetUrlById.get(rawId) ||
						null
					if (!url) continue
					if (out.some((x) => x.url === url)) continue
					out.push({ kind: 'image', url })
					continue
				}

				if (b.type === 'video') {
					const posterUrl = String((b as any).data?.posterUrl ?? '').trim()
					const isPosterHttp =
						posterUrl.startsWith('http://') || posterUrl.startsWith('https://')
					if (isPosterHttp) {
						if (!out.some((x) => x.url === posterUrl))
							out.push({ kind: 'video', url: posterUrl })
						continue
					}

					const rawId = String((b as any).data?.assetId ?? '').trim()
					if (!rawId) continue
					const asset = assetById.get(rawId)
					const thumbId = asset?.thumbnailAssetId
						? String(asset.thumbnailAssetId)
						: null
					const thumbUrl = thumbId ? assetUrlById.get(thumbId) : null
					if (!thumbUrl) continue
					if (out.some((x) => x.url === thumbUrl)) continue
					out.push({ kind: 'video', url: thumbUrl })
					continue
				}
			}
			return out
		},
		[assetById, assetUrlById],
	)

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

	const deletePostMutation = useEnhancedMutation(
		queryOrpc.thread.deletePost.mutationOptions({
			onSuccess: async ({ deletedPostIds }) => {
				setSelectedPostId((prev) =>
					prev && deletedPostIds.includes(prev) ? null : prev,
				)
				await qc.invalidateQueries({
					queryKey: queryOrpc.thread.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.postDeleted'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const deletingPostId = deletePostMutation.isPending
		? deletePostMutation.variables?.postId
		: null

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
			toast.error(getUserFriendlyErrorMessage(e))
		} finally {
			setIsUploadingAudio(false)
			if (audioFileInputRef.current) audioFileInputRef.current.value = ''
		}
	}

	// ---------- Thread template (read-only) ----------
	const effectiveTemplateIdForLibrary = React.useMemo(() => {
		return thread?.templateId
			? String(thread.templateId)
			: DEFAULT_THREAD_TEMPLATE_ID
	}, [thread?.templateId])

	const normalizedTemplateConfig = React.useMemo(() => {
		if (!thread) return null
		return thread.templateConfig ?? DEFAULT_THREAD_TEMPLATE_CONFIG
	}, [thread?.id, thread?.templateConfig])

	return (
		<div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
			<div className="border-b border-border bg-card">
				<div className="w-full px-4 py-3 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<div className="flex items-center gap-2">
								<Link
									to="/threads"
									className="text-[10px] font-sans uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
								>
									{t('header.breadcrumb')}
								</Link>
								<span className="text-[10px] text-muted-foreground">/</span>
								<span className="text-[10px] font-mono text-muted-foreground uppercase">
									{id.slice(0, 8)}
								</span>
							</div>
							<h1 className="font-sans text-lg font-bold uppercase tracking-tight">
								{thread?.title ?? '…'}
							</h1>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-[2px] shadow-none font-sans text-xs uppercase tracking-wider h-8"
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
						</div>
					</div>
				</div>
			</div>

			<div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				{/* Left Column: Preview & Library (Flexible width, maybe 7 cols) */}
				<div className="lg:col-span-7 space-y-6">
					{/* Preview Section */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
								{t('sections.preview')}
							</div>
							{/* Render Status / Action could go here or bottom */}
						</div>

						<div className="border border-border bg-card">
							<ThreadRemotionPlayerCard
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
								templateId={effectiveTemplateIdForLibrary as any}
								templateConfig={
									(normalizedTemplateConfig ??
										DEFAULT_THREAD_TEMPLATE_CONFIG) as any
								}
							/>
						</div>
					</div>

					{/* Template Library */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
								{t('sections.templateLibrary')}
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="rounded-[2px] shadow-none font-sans text-[10px] uppercase h-7"
								asChild
							>
								<Link to="/thread-templates">
									{t('actions.manageTemplates')}
								</Link>
							</Button>
						</div>
						<div className="border border-border bg-card">
							<ThreadTemplateLibraryCard
								threadId={id}
								effectiveTemplateId={effectiveTemplateIdForLibrary}
								normalizedTemplateConfig={normalizedTemplateConfig}
								onApplied={refreshThread}
							/>
						</div>
					</div>

					{/* Render Section (Moved up or kept here) */}
					<div className="space-y-2">
						<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
							{t('sections.render')}
						</div>
						<div className="border border-border bg-card p-4">
							<div className="flex flex-wrap items-center gap-3">
								<Button
									className="rounded-[2px] shadow-none font-sans text-xs uppercase"
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
								<div className="mt-3 font-mono text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
									<div className="flex items-center gap-2">
										<div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
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
										<a
											className="underline hover:text-foreground"
											href={renderedDownloadUrl}
										>
											{t('render.downloadMp4')}
										</a>
									) : null}
								</div>
							) : null}
						</div>
					</div>
				</div>

				{/* Right Column: Editor & Assets (5 cols) */}
				<div className="lg:col-span-5 space-y-6">
					{/* Audio Section */}
					<div className="space-y-2">
						<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
							{t('sections.audio')}
						</div>
						<div className="border border-border bg-card p-4 space-y-4">
							<div className="flex flex-wrap items-center gap-2">
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
									variant="outline"
									className="rounded-[2px] shadow-none font-sans text-xs uppercase h-8"
									disabled={isUploadingAudio}
									onClick={() => audioFileInputRef.current?.click()}
								>
									{isUploadingAudio
										? t('audio.actions.uploading')
										: t('audio.actions.upload')}
								</Button>
								{thread?.audioAssetId ? (
									<Button
										type="button"
										variant="ghost"
										className="rounded-[2px] shadow-none font-sans text-xs uppercase h-8 hover:bg-destructive/10 hover:text-destructive"
										disabled={setAudioAssetMutation.isPending}
										onClick={() => void setThreadAudio(null)}
									>
										{t('audio.actions.clear')}
									</Button>
								) : null}
							</div>
							{audio?.url ? (
								<audio
									controls
									src={String(audio.url)}
									className="w-full h-8"
								/>
							) : null}

							{/* Audio Library List (Simplified) */}
							{audioAssets.length > 0 ? (
								<div className="space-y-2 border-t border-border pt-3">
									<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
										{t('audio.labels.library')}
									</div>
									<div className="max-h-[150px] overflow-y-auto space-y-1 pr-1">
										{audioAssets.map((a: any) => {
											const isCurrent =
												thread?.audioAssetId &&
												String(thread.audioAssetId) === String(a.id)
											return (
												<div
													key={String(a.id)}
													className={`group flex items-center justify-between border px-2 py-1.5 font-mono text-[10px] ${
														isCurrent
															? 'border-primary bg-primary/5'
															: 'border-border bg-background hover:bg-muted/50'
													}`}
												>
													<div className="truncate flex-1">
														{String(a.id).slice(0, 8)}...
														{typeof a.durationMs === 'number'
															? ` · ${Math.round(a.durationMs / 1000)}s`
															: ''}
													</div>
													{!isCurrent && (
														<button
															type="button"
															className="opacity-0 group-hover:opacity-100 uppercase tracking-wider hover:underline"
															disabled={
																setAudioAssetMutation.isPending ||
																String(a.status) !== 'ready'
															}
															onClick={() => void setThreadAudio(String(a.id))}
														>
															Use
														</button>
													)}
												</div>
											)
										})}
									</div>
								</div>
							) : null}
						</div>
					</div>

					{/* Posts & Editor */}
					<div className="space-y-2">
						<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
							{t('sections.posts')}
						</div>
						<div className="border border-border bg-card flex flex-col max-h-[800px]">
							{/* Post List */}
								<div className="flex-1 overflow-y-auto min-h-[150px] max-h-[300px] border-b border-border">
									{root ? (
										<button
											type="button"
											onClick={() => setSelectedPostId(root.id)}
											className={`w-full text-left border-b border-border px-4 py-3 font-mono text-xs transition-colors ${
												selectedPostId === root.id
													? 'bg-primary/5'
													: 'hover:bg-muted/30'
											}`}
										>
											<div className="flex items-center gap-2 mb-1">
												<span className="uppercase tracking-widest text-[10px] text-muted-foreground font-bold border border-border px-1 rounded-[2px]">
													{t('labels.root')}
												</span>
												<span className="font-bold">{root.authorName}</span>
											</div>
											{(() => {
												const preview = getPostPreviewMedia(root.contentBlocks)
												return preview.length > 0 ? (
													<div className="mt-2 flex gap-1">
														{preview.map((m, idx) => (
															<div
																key={`${m.kind}:${m.url}:${idx}`}
																className="relative h-10 w-16 overflow-hidden border border-border/60 bg-muted/30"
															>
																<img
																	src={m.url}
																	alt=""
																	className="h-full w-full object-cover"
																	loading="lazy"
																/>
																{m.kind === 'video' ? (
																	<div className="absolute inset-0 flex items-center justify-center">
																		<div className="rounded-full bg-background/70 p-1.5 text-foreground shadow-sm">
																			<Play className="h-3 w-3" />
																		</div>
																	</div>
																) : null}
															</div>
														))}
													</div>
												) : null
											})()}
										</button>
									) : null}
									{replies.map((p) => {
										const isSelected = selectedPostId === p.id
										const isDeleting = deletingPostId === p.id
										const preview = getPostPreviewMedia(p.contentBlocks)
										return (
											<div
												key={p.id}
												className={`flex items-stretch border-b border-border last:border-0 ${
												isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
											}`}
										>
												<button
													type="button"
													onClick={() => setSelectedPostId(p.id)}
													className="flex-1 text-left px-4 py-3 font-mono text-xs transition-colors"
												>
													<div className="font-bold mb-1">{p.authorName}</div>
													<div className="truncate text-muted-foreground opacity-80">
														{p.plainText || t('labels.emptyText')}
													</div>
													{preview.length > 0 ? (
														<div className="mt-2 flex gap-1">
															{preview.map((m, idx) => (
																<div
																	key={`${m.kind}:${m.url}:${idx}`}
																	className="relative h-10 w-16 overflow-hidden border border-border/60 bg-muted/30"
																>
																	<img
																		src={m.url}
																		alt=""
																		className="h-full w-full object-cover"
																		loading="lazy"
																	/>
																	{m.kind === 'video' ? (
																		<div className="absolute inset-0 flex items-center justify-center">
																			<div className="rounded-full bg-background/70 p-1.5 text-foreground shadow-sm">
																				<Play className="h-3 w-3" />
																			</div>
																		</div>
																	) : null}
																</div>
															))}
														</div>
													) : null}
												</button>
												<Button
													type="button"
													variant="ghost"
												size="icon"
												className="h-8 w-8 my-auto mr-2 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10"
												aria-label={t('actions.deletePostAria')}
												disabled={deletePostMutation.isPending}
												onClick={() => {
													if (deletePostMutation.isPending) return
													void (async () => {
														const ok = await confirmDialog({
															title: t('confirmDeletePost.title'),
															description: t(
																'confirmDeletePost.description',
																{
																	authorName: p.authorName,
																},
															),
															confirmText: t('confirmDeletePost.confirmText'),
															variant: 'destructive',
														})
														if (!ok) return
														deletePostMutation.mutate({
															threadId: id,
															postId: p.id,
														})
													})()
												}}
											>
												{isDeleting ? (
													<Loader2 className="h-3 w-3 animate-spin" />
												) : (
													<Trash2 className="h-3 w-3" />
												)}
											</Button>
										</div>
									)
								})}
							</div>

							{/* Editor Area */}
							<div className="p-4 space-y-4 bg-muted/10">
								<div className="flex items-center justify-between">
									<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
										Editor
									</div>
									<div className="flex items-center gap-2">
										{canIngestAssets ? (
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-[2px] shadow-none font-sans text-[10px] uppercase h-6"
												disabled={ingestAssetsMutation.isPending}
												onClick={() =>
													ingestAssetsMutation.mutate({ threadId: id })
												}
											>
												{ingestAssetsMutation.isPending
													? 'DL...'
													: 'Download Media'}
											</Button>
										) : null}
									</div>
								</div>

								{/* Translation Controls */}
								<div className="flex items-center gap-2 border-b border-border pb-3">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="rounded-[2px] shadow-none font-sans text-[10px] uppercase h-6 px-2 border border-border"
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
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											'Translate to ZH'
										)}
									</Button>
									{selectedZhTranslation ? (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="rounded-[2px] shadow-none font-sans text-[10px] uppercase h-6 px-2 border border-border hover:bg-accent"
											onClick={() => {
												setDraftText(selectedZhTranslation)
												toast.message(t('toasts.translationApplied'))
											}}
										>
											{t('actions.useTranslation')}
										</Button>
									) : null}
								</div>

								{selectedZhTranslation ? (
									<div className="bg-muted/30 border border-border p-2">
										<div className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
											{t('sections.translation')}
										</div>
										<div className="font-mono text-xs whitespace-pre-wrap">
											{selectedZhTranslation}
										</div>
									</div>
								) : null}

								<div className="space-y-2">
									<Textarea
										value={draftText}
										onChange={(e) => setDraftText(e.target.value)}
										className="rounded-[2px] border-border focus:ring-1 focus:ring-ring shadow-none font-mono text-xs min-h-[200px] resize-y bg-background"
										placeholder={t('inputs.postContentPlaceholder')}
									/>
									<div className="flex items-center justify-between">
										<Button
											type="button"
											variant="ghost"
											className="rounded-[2px] font-sans text-xs uppercase h-7 text-muted-foreground hover:text-foreground"
											onClick={() => {
												setDraftText(
													firstTextBlockText(selectedPost?.contentBlocks) || '',
												)
												toast.message(t('toasts.reset'))
											}}
										>
											{t('actions.reset')}
										</Button>
										<Button
											className="rounded-[2px] shadow-none font-sans text-xs uppercase h-7"
											disabled={
												updateMutation.isPending ||
												!selectedPost?.id ||
												!thread?.id
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
									</div>
								</div>

								{/* Debug / Media Details */}
								<details className="group">
									<summary className="cursor-pointer select-none py-2 font-sans text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
										Debug & Media Data
									</summary>
									<div className="space-y-3 pt-2">
										{/* Media List in Editor */}
										{(selectedPost?.contentBlocks ?? []).filter(
											(b: any) => b?.type !== 'text',
										).length > 0 ? (
											<div className="space-y-1">
												{(selectedPost?.contentBlocks ?? [])
													.filter((b: any) => b?.type && b.type !== 'text')
													.map((b: any) => {
														const assetId =
															b.data?.assetId || b.data?.previewAssetId
														return (
															<div
																key={String(b.id)}
																className="font-mono text-[10px] border border-border p-1.5 bg-background truncate"
															>
																<span className="text-muted-foreground uppercase mr-1">
																	{b.type}
																</span>
																{assetId || 'no-id'}
															</div>
														)
													})}
											</div>
										) : null}

										<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Raw Post
										</div>
										<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words border border-border bg-background p-2 font-mono text-[10px]">
											{selectedPostJson || t('debug.none')}
										</pre>
									</div>
								</details>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
