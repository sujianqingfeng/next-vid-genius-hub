/**
 * General formatting utilities
 */
export function formatNumber(num: number): string {
	return new Intl.NumberFormat('en-US').format(num)
}

export function formatBytes(bytes: number | null | undefined): string {
	if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
	if (bytes === 0) return '0 B'

	const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
	const base = 1024
	let value = bytes
	let unitIndex = 0

	while (value >= base && unitIndex < units.length - 1) {
		value /= base
		unitIndex += 1
	}

	const decimals = value >= 10 || unitIndex === 0 ? 0 : 1
	return `${value.toFixed(decimals)} ${units[unitIndex]}`
}
