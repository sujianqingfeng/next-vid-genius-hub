import type { ThreadTemplateConfigV1 } from './types'

const DEFAULT_SCENES: NonNullable<ThreadTemplateConfigV1['scenes']> = {
	cover: {
		root: {
			type: 'Stack',
			direction: 'column',
			gap: 26,
			paddingX: 80,
			paddingY: 80,
			maxWidth: 1500,
			children: [
				{
					type: 'Stack',
					direction: 'row',
					align: 'center',
					gap: 12,
					children: [
						{
							type: 'Box',
							width: 10,
							height: 10,
							background: 'var(--tf-accent)',
						},
						{
							type: 'Text',
							bind: 'thread.source',
							color: 'muted',
							size: 14,
							weight: 700,
							maxLines: 1,
						},
						{
							type: 'Text',
							bind: 'thread.sourceUrl',
							color: 'muted',
							size: 12,
							weight: 600,
							maxLines: 1,
						},
					],
				},
				{
					type: 'Text',
					bind: 'thread.title',
					size: 64,
					weight: 900,
					maxLines: 4,
				},
				{
					type: 'Stack',
					direction: 'row',
					align: 'center',
					gap: 14,
					children: [
						{
							type: 'Avatar',
							bind: 'root.author.avatarAssetId',
							size: 44,
							border: true,
							background: 'rgba(255,255,255,0.04)',
						},
						{
							type: 'Stack',
							direction: 'column',
							gap: 2,
							children: [
								{
									type: 'Text',
									bind: 'root.author.name',
									size: 16,
									weight: 800,
									maxLines: 1,
								},
								{
									type: 'Text',
									text: 'ROOT POST',
									color: 'muted',
									size: 12,
									weight: 700,
									maxLines: 1,
								},
							],
						},
					],
				},
				{
					type: 'Box',
					padding: 28,
					border: true,
					background: 'var(--tf-surface)',
					children: [
						{
							type: 'ContentBlocks',
							bind: 'root.contentBlocks',
							gap: 16,
							maxHeight: 900,
						},
					],
				},
				{
					type: 'Watermark',
					position: 'bottom-right',
					color: 'muted',
					size: 12,
					weight: 700,
					opacity: 0.7,
					padding: 18,
				},
			],
		},
	},
	post: {
		root: {
			type: 'Stack',
			direction: 'column',
			gapY: 18,
			padding: 64,
			children: [
				{
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
				},
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
													background: 'rgba(255,255,255,0.04)',
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
						},
						{
							type: 'Box',
							flex: 42,
							maxHeight: 2000,
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
														gapX: 10,
														children: [
															{
																type: 'Avatar',
																bind: 'post.author.avatarAssetId',
																size: 32,
																border: true,
																background: 'rgba(255,255,255,0.04)',
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
											{ type: 'Divider', margin: 0, opacity: 0.6 },
											{
												type: 'Text',
												bind: 'post.plainText',
												bilingual: true,
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
				{
					type: 'Watermark',
					position: 'bottom-right',
					color: 'muted',
					size: 12,
					weight: 700,
					opacity: 0.7,
					padding: 18,
				},
			],
		},
	},
}

export const DEFAULT_THREAD_TEMPLATE_CONFIG: ThreadTemplateConfigV1 = {
	version: 1,
	theme: {
		background: '#0b1020',
		surface: 'rgba(255,255,255,0.06)',
		border: 'rgba(255,255,255,0.10)',
		textPrimary: '#e5e7eb',
		textSecondary: 'rgba(229,231,235,0.85)',
		textMuted: 'rgba(229,231,235,0.65)',
		accent: '#22c55e',
		accentGlow: 'rgba(34, 197, 94, 0.25)',
	},
	typography: { fontPreset: 'noto', fontScale: 1 },
	layout: {},
	brand: { showWatermark: false, watermarkText: '' },
	motion: { enabled: true, intensity: 'normal' },
	scenes: DEFAULT_SCENES,
}

/**
 * Increment when the template compile/render logic changes in a way that might affect
 * determinism/replay of previously-saved configs.
 */
export const THREAD_TEMPLATE_COMPILE_VERSION = 24
