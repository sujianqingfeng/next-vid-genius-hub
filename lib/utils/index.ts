import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * This function combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// Re-export all utilities except file to avoid client-side fs issues
export * from './time'
export {
	getTimeAgo as formatTimeAgo
} from './time'
export {
	formatFileSize,
	formatNumber,
	formatNumberAbbreviated,
	formatCurrency,
	formatPercentage,
	capitalize,
	titleCase,
	truncateText,
	escapeHtml,
	stripHtml,
	formatUrl,
	formatList,
	formatColor,
	hexToRgb,
	rgbToHex,
	rgbToHsl,
	hslToRgb,
	getColorBrightness,
	isColorLight,
	getContrastColor,
	adjustColorBrightness,
	lightenColor,
	darkenColor,
	addOpacity,
	blendColors,
	randomColor,
	generateColorPalette,
	colorNameToHex,
	isValidColor,
	getComplementaryColor,
	getTriadicColors,
	parseVTT,
	vttToTimestamps,
	parseVTTTime,
	secondsToVTTTime,
	generateVTT,
	mergeVTTTimestamps,
	splitVTTTimestamps,
	shiftVTTTimestamps,
	scaleVTTTimestamps,
	validateVTT,
	srtToVTT,
	vttToSRT
} from './format'
export * from './validation'

// File utilities are not available in client-side utils
// They must be imported directly from ~/lib/utils/file when needed on server side
