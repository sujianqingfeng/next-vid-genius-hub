/**
 * Minimal color helpers used by subtitle rendering components.
 */

type Rgb = { r: number; g: number; b: number }

function parseHexToRgb(hex: string): Rgb | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
	if (!result) return null
	return {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16),
	}
}

export function hexToRgba(hex: string, opacity: number): string {
	const rgb = parseHexToRgb(hex)
	const alpha = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1
	if (!rgb) return `rgba(0, 0, 0, ${alpha})`
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}
