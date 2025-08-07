/**
 * Formatting utilities for consistent number, time, and data formatting across the application
 */

/**
 * Format number with K, M, B suffixes for display
 * @param num - The number to format
 * @param options - Formatting options
 * @returns Formatted string (e.g., "1.2K", "3.4M", "2.1B")
 */
export function formatNumber(
	num: number,
	options: {
		/** Include B (billion) suffix */
		includeBillion?: boolean
		/** Decimal places for the formatted number */
		decimals?: number
	} = {},
): string {
	const { includeBillion = true, decimals = 1 } = options

	if (includeBillion && num >= 1000000000) {
		return `${(num / 1000000000).toFixed(decimals)}B`
	}
	if (num >= 1000000) {
		return `${(num / 1000000).toFixed(decimals)}M`
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(decimals)}K`
	}
	return num.toString()
}

/**
 * Format view count with K, M, B suffixes
 * @param count - The view count to format
 * @returns Formatted string (e.g., "1.2K views", "3.4M views")
 */
export function formatViewCount(count: number): string {
	return formatNumber(count, { includeBillion: true })
}

/**
 * Format likes count with K, M suffixes (no B suffix for likes)
 * @param count - The likes count to format
 * @returns Formatted string (e.g., "1.2K", "3.4M")
 */
export function formatLikes(count: number): string {
	return formatNumber(count, { includeBillion: false })
}

/**
 * Format time ago from a date
 * @param date - The date to calculate time ago from
 * @returns Formatted string (e.g., "2h ago", "3d ago", "1mo ago")
 */
export function formatTimeAgo(date: Date): string {
	const now = new Date()
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

	if (diffInSeconds < 60) return 'Just now'
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
	if (diffInSeconds < 2592000)
		return `${Math.floor(diffInSeconds / 86400)}d ago`
	return `${Math.floor(diffInSeconds / 2592000)}mo ago`
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const remainingSeconds = Math.floor(seconds % 60)

	if (hours > 0) {
		return `${hours.toString().padStart(2, '0')}:${minutes
			.toString()
			.padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
	}
	return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
		.toString()
		.padStart(2, '0')}`
}

/**
 * Format file size in bytes to human readable format
 * @param bytes - File size in bytes
 * @returns Formatted file size string (e.g., "1.2 MB", "3.4 GB")
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes'

	const k = 1024
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format date to readable string
 * @param date - The date to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(
	date: Date,
	options: {
		/** Include time in the format */
		includeTime?: boolean
		/** Use relative time if recent */
		relative?: boolean
	} = {},
): string {
	const { includeTime = false, relative = false } = options

	if (relative) {
		const now = new Date()
		const diffInDays = Math.floor(
			(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
		)

		if (diffInDays === 0) return 'Today'
		if (diffInDays === 1) return 'Yesterday'
		if (diffInDays < 7) return `${diffInDays} days ago`
	}

	const dateOptions: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	}

	if (includeTime) {
		dateOptions.hour = '2-digit'
		dateOptions.minute = '2-digit'
	}

	return date.toLocaleDateString('en-US', dateOptions)
}

/**
 * Format percentage with optional decimal places
 * @param value - The value to format as percentage
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals = 1): string {
	return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format currency amount
 * @param amount - The amount to format
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
	}).format(amount)
}
