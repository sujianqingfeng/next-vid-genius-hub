import { z } from 'zod'
import type { CommentsTemplateConfig } from '@app/remotion-project/types'

const ColorString = z.string().min(1)

export const CommentsTemplateConfigSchema: z.ZodType<CommentsTemplateConfig> =
	z
		.object({
			theme: z
				.object({
					background: ColorString.optional(),
					surface: ColorString.optional(),
					border: ColorString.optional(),
					textPrimary: ColorString.optional(),
					textSecondary: ColorString.optional(),
					textMuted: ColorString.optional(),
					accent: ColorString.optional(),
					accentGlow: ColorString.optional(),
				})
				.optional(),
			typography: z
				.object({
					fontPreset: z.enum(['noto', 'inter', 'system']).optional(),
					fontScale: z.number().min(0.5).max(2).optional(),
				})
				.optional(),
			layout: z
				.object({
					paddingX: z.number().int().min(0).max(240).optional(),
					paddingY: z.number().int().min(0).max(240).optional(),
					infoPanelWidth: z.number().int().min(320).max(1200).optional(),
				})
				.optional(),
			brand: z
				.object({
					showWatermark: z.boolean().optional(),
					watermarkText: z.string().max(80).optional(),
				})
				.optional(),
			motion: z
				.object({
					enabled: z.boolean().optional(),
					intensity: z.enum(['subtle', 'normal', 'strong']).optional(),
				})
				.optional(),
		})
		.strict()

export const DEFAULT_COMMENTS_TEMPLATE_CONFIG: CommentsTemplateConfig = {
	theme: {
		background: '#F7F3EF',
		surface: '#FFFFFF',
		border: 'rgba(31, 42, 53, 0.08)',
		textPrimary: '#1F2A35',
		textSecondary: '#2C3A4A',
		textMuted: '#6B7280',
		accent: '#FF5A5F',
		accentGlow: 'rgba(255, 90, 95, 0.2)',
	},
	typography: { fontPreset: 'noto', fontScale: 1 },
	layout: { paddingX: 80, paddingY: 60, infoPanelWidth: 680 },
	brand: { showWatermark: false, watermarkText: '' },
	motion: { enabled: true, intensity: 'normal' },
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseCommentsTemplateConfig(
	input: unknown,
	fallback: CommentsTemplateConfig = {},
): CommentsTemplateConfig {
	const res = CommentsTemplateConfigSchema.safeParse(input)
	if (res.success) return res.data
	return fallback
}

export function mergeCommentsTemplateConfig(
	base: CommentsTemplateConfig,
	override: CommentsTemplateConfig,
): CommentsTemplateConfig {
	const out: CommentsTemplateConfig = { ...base }
	for (const key of Object.keys(override) as Array<keyof CommentsTemplateConfig>) {
		const value = override[key]
		if (value == null) continue
		const existing = out[key]
		if (isObject(existing) && isObject(value)) {
			out[key] = { ...existing, ...value } as any
			continue
		}
		out[key] = value as any
	}
	return out
}

