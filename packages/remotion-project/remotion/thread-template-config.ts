import type { ThreadTemplateConfigV1 } from './types'

const DEFAULT_SCENES: NonNullable<ThreadTemplateConfigV1['scenes']> = {
	cover: {
		root: {
			type: 'Stack',
			direction: 'column',
			gapY: 26,
			paddingX: 96,
			paddingY: 96,
			justify: 'center',
			overflow: 'hidden',
			children: [
				{
					type: 'Background',
					color:
						'radial-gradient(1200px circle at 18% 12%, rgba(34,197,94,0.22), transparent 55%), radial-gradient(900px circle at 88% 14%, rgba(59,130,246,0.10), transparent 58%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 55%)',
					opacity: 1,
				},
				{
					type: 'Stack',
					direction: 'column',
					gapY: 22,
					maxWidth: 1500,
					children: [
						{
							type: 'Box',
							paddingX: 14,
							paddingY: 10,
							border: true,
							background: 'rgba(255,255,255,0.03)',
							radius: 999,
							children: [
								{
									type: 'Stack',
									direction: 'row',
									align: 'center',
									gapX: 10,
									children: [
										{
											type: 'Box',
											width: 8,
											height: 8,
											background: 'var(--tf-accent)',
											radius: 999,
										},
										{
											type: 'Text',
											bind: 'thread.source',
											color: 'muted',
											size: 12,
											weight: 800,
											uppercase: true,
											letterSpacing: 0.22,
											maxLines: 1,
										},
									],
								},
							],
						},
						{
							type: 'Text',
							bind: 'thread.title',
							size: 72,
							weight: 900,
							lineHeight: 1.05,
							letterSpacing: -0.02,
							maxLines: 3,
						},
						{
							type: 'Box',
							padding: 32,
							border: true,
							radius: 20,
							background: 'var(--tf-surface)',
							children: [
								{
									type: 'Text',
									bind: 'root.plainText',
									bilingual: true,
									bilingualPrimary: 'zh',
									secondaryPlacement: 'above',
									size: 32,
									weight: 750,
									lineHeight: 1.5,
									maxLines: 8,
								},
							],
						},
						{
							type: 'Stack',
							direction: 'row',
							align: 'center',
							gapX: 10,
							children: [
								{
									type: 'Text',
									bind: 'root.author.name',
									size: 16,
									weight: 850,
									maxLines: 1,
								},
								{
									type: 'Text',
									bind: 'root.author.handle',
									color: 'muted',
									size: 14,
									weight: 700,
									maxLines: 1,
								},
							],
						},
					],
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
												secondaryPlacement: 'above',
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
export const THREAD_TEMPLATE_COMPILE_VERSION = 30
