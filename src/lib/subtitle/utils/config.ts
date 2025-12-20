import type { SubtitleRenderConfig } from '~/lib/subtitle/types'

/**
 * Compare two subtitle render configs for semantic equality
 */
export function areConfigsEqual(
	configA: SubtitleRenderConfig,
	configB: SubtitleRenderConfig,
): boolean {
	const basicConfigEqual =
		configA.fontSize === configB.fontSize &&
		Math.abs(configA.backgroundOpacity - configB.backgroundOpacity) < 0.001 &&
		configA.textColor.toLowerCase() === configB.textColor.toLowerCase() &&
		configA.backgroundColor.toLowerCase() ===
			configB.backgroundColor.toLowerCase() &&
		configA.outlineColor.toLowerCase() === configB.outlineColor.toLowerCase() &&
		configA.timeSegmentEffects.length === configB.timeSegmentEffects.length

	if (!basicConfigEqual) return false

	const hintConfigA = configA.hintTextConfig
	const hintConfigB = configB.hintTextConfig
	if (!hintConfigA && !hintConfigB) return true
	if (!hintConfigA || !hintConfigB) return false

	return (
		hintConfigA.enabled === hintConfigB.enabled &&
		hintConfigA.text === hintConfigB.text &&
		hintConfigA.fontSize === hintConfigB.fontSize &&
		hintConfigA.textColor.toLowerCase() ===
			hintConfigB.textColor.toLowerCase() &&
		hintConfigA.backgroundColor.toLowerCase() ===
			hintConfigB.backgroundColor.toLowerCase() &&
		Math.abs(
			(hintConfigA.backgroundOpacity ?? 0.8) -
				(hintConfigB.backgroundOpacity ?? 0.8),
		) < 0.001 &&
		hintConfigA.outlineColor.toLowerCase() ===
			hintConfigB.outlineColor.toLowerCase() &&
		hintConfigA.position === hintConfigB.position &&
		hintConfigA.animation === hintConfigB.animation
	)
}
