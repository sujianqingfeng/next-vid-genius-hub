/**
 * Color utility functions
 */

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null
}

/**
 * Parse RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
	return '#' + [r, g, b].map(x => {
		const hex = x.toString(16)
		return hex.length === 1 ? '0' + hex : hex
	}).join('')
}

/**
 * Parse HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	s /= 100
	l /= 100

	const k = (n: number) => (n + h / 30) % 12
	const a = s * Math.min(l, 1 - l)
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))

	return {
		r: Math.round(255 * f(0)),
		g: Math.round(255 * f(8)),
		b: Math.round(255 * f(4))
	}
}

/**
 * Parse RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255
	g /= 255
	b /= 255

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	let h = 0, s
	const l = (max + min) / 2

	if (max === min) {
		h = s = 0 // achromatic
	} else {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break
			case g: h = (b - r) / d + 2; break
			case b: h = (r - g) / d + 4; break
		}
		h /= 6
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100)
	}
}

/**
 * Get color brightness (0-255)
 */
export function getColorBrightness(color: string): number {
	const rgb = hexToRgb(color)
	if (!rgb) return 0

	// Using the formula for relative luminance
	return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b)
}

/**
 * Determine if color is light or dark
 */
export function isColorLight(color: string): boolean {
	return getColorBrightness(color) > 128
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(backgroundColor: string): string {
	return isColorLight(backgroundColor) ? '#000000' : '#ffffff'
}

/**
 * Adjust color brightness
 */
export function adjustColorBrightness(color: string, amount: number): string {
	const rgb = hexToRgb(color)
	if (!rgb) return color

	const adjust = (value: number) => Math.max(0, Math.min(255, value + amount))

	return rgbToHex(
		adjust(rgb.r),
		adjust(rgb.g),
		adjust(rgb.b)
	)
}

/**
 * Lighten a color
 */
export function lightenColor(color: string, percent: number): string {
	const rgb = hexToRgb(color)
	if (!rgb) return color

	const factor = 1 + percent / 100

	return rgbToHex(
		Math.min(255, Math.round(rgb.r * factor)),
		Math.min(255, Math.round(rgb.g * factor)),
		Math.min(255, Math.round(rgb.b * factor))
	)
}

/**
 * Darken a color
 */
export function darkenColor(color: string, percent: number): string {
	const rgb = hexToRgb(color)
	if (!rgb) return color

	const factor = 1 - percent / 100

	return rgbToHex(
		Math.round(rgb.r * factor),
		Math.round(rgb.g * factor),
		Math.round(rgb.b * factor)
	)
}

/**
 * Get color opacity
 */
export function addOpacity(color: string, opacity: number): string {
	const rgb = hexToRgb(color)
	if (!rgb) return color

	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
}

/**
 * Convert hex color to rgba string with given opacity.
 * Provided for compatibility with modules that previously imported `hexToRgba`.
 */
export function hexToRgba(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex)
  const alpha = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * Blend two colors
 */
export function blendColors(color1: string, color2: string, ratio: number): string {
	const rgb1 = hexToRgb(color1)
	const rgb2 = hexToRgb(color2)

	if (!rgb1 || !rgb2) return color1

	const factor = Math.max(0, Math.min(1, ratio))

	return rgbToHex(
		Math.round(rgb1.r * (1 - factor) + rgb2.r * factor),
		Math.round(rgb1.g * (1 - factor) + rgb2.g * factor),
		Math.round(rgb1.b * (1 - factor) + rgb2.b * factor)
	)
}

/**
 * Generate a random color
 */
export function randomColor(): string {
	return rgbToHex(
		Math.floor(Math.random() * 256),
		Math.floor(Math.random() * 256),
		Math.floor(Math.random() * 256)
	)
}

/**
 * Generate a color palette from base color
 */
export function generateColorPalette(baseColor: string, count: number): string[] {
	const rgb = hexToRgb(baseColor) || { r: 0, g: 0, b: 0 }
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
	const colors: string[] = []

	for (let i = 0; i < count; i++) {
		const hueShift = (360 / count) * i
		const newHue = (hsl.h + hueShift) % 360
		const rgb = hslToRgb(newHue, hsl.s, hsl.l)
		colors.push(rgbToHex(rgb.r, rgb.g, rgb.b))
	}

	return colors
}

/**
 * Convert color name to hex
 */
export function colorNameToHex(name: string): string {
	const colorMap: Record<string, string> = {
		// Basic colors
		black: '#000000',
		white: '#ffffff',
		red: '#ff0000',
		green: '#00ff00',
		blue: '#0000ff',
		yellow: '#ffff00',
		cyan: '#00ffff',
		magenta: '#ff00ff',

		// Web colors
		gray: '#808080',
		grey: '#808080',
		silver: '#c0c0c0',
		maroon: '#800000',
		olive: '#808000',
		lime: '#00ff00',
		aqua: '#00ffff',
		teal: '#008080',
		navy: '#000080',
		fuchsia: '#ff00ff',
		purple: '#800080',

		// Common variations
		lightgray: '#d3d3d3',
		lightgrey: '#d3d3d3',
		darkgray: '#a9a9a9',
		darkgrey: '#a9a9a9',
		orange: '#ffa500',
		pink: '#ffc0cb',
		brown: '#964b00',
	}

	return colorMap[name.toLowerCase()] || name
}

/**
 * Validate color format
 */
export function isValidColor(color: string): boolean {
	// Check hex format
	if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
		return true
	}

	// Check rgb/rgba format
	if (/^rgb(a)?\(\s*(\d{1,3}%?\s*,\s*){2}\d{1,3}%?\s*(,\s*\d*\.?\d+)?\s*\)$/.test(color)) {
		return true
	}

	// Check hsl/hsla format
	if (/^hsl(a)?\(\s*(\d{1,3}%?\s*,\s*){2}\d{1,3}%?\s*(,\s*\d*\.?\d+)?\s*\)$/.test(color)) {
		return true
	}

	// Check named colors
	const namedColors = [
		'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
		'gray', 'grey', 'silver', 'maroon', 'olive', 'lime', 'aqua', 'teal',
		'navy', 'fuchsia', 'purple', 'orange', 'pink', 'brown'
	]

	return namedColors.includes(color.toLowerCase())
}

/**
 * Get complementary color
 */
export function getComplementaryColor(color: string): string {
	const rgbInput = hexToRgb(color) || { r: 0, g: 0, b: 0 }
	const hsl = rgbToHsl(rgbInput.r, rgbInput.g, rgbInput.b)
	const complementaryHue = (hsl.h + 180) % 360
	const rgb = hslToRgb(complementaryHue, hsl.s, hsl.l)
	return rgbToHex(rgb.r, rgb.g, rgb.b)
}

/**
 * Get triadic color scheme
 */
export function getTriadicColors(color: string): string[] {
	const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 }
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
	const colors = [color]

	for (let i = 1; i <= 2; i++) {
		const hue = (hsl.h + (i * 120)) % 360
		const rgb = hslToRgb(hue, hsl.s, hsl.l)
		colors.push(rgbToHex(rgb.r, rgb.g, rgb.b))
	}

	return colors
}
