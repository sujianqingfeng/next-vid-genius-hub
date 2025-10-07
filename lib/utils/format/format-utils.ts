/**
 * General formatting utility functions
 */

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number): string {
	return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format number with abbreviated suffixes (K, M, B)
 */
export function formatNumberAbbreviated(num: number): string {
	if (num < 1000) return num.toString()
	if (num < 1000000) return `${(num / 1000).toFixed(1)}K`
	if (num < 1000000000) return `${(num / 1000000).toFixed(1)}M`
	return `${(num / 1000000000).toFixed(1)}B`
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B'

	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
	return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
	}).format(amount)
}

/**
 * Format date to localized string
 */
export function formatDate(date: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
	const dateObj = new Date(date)
	const defaultOptions: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...options,
	}
	return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj)
}

/**
 * Format date to relative time
 */
export function formatDateRelative(date: Date | string | number): string {
	const dateObj = new Date(date)
	const now = new Date()
	const diffMs = now.getTime() - dateObj.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

	if (diffDays === 0) return 'Today'
	if (diffDays === 1) return 'Yesterday'
	if (diffDays < 7) return `${diffDays} days ago`
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
	return `${Math.floor(diffDays / 365)} years ago`
}

/**
 * Format text with proper capitalization
 */
export function capitalize(str: string): string {
	if (!str) return str
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Format text to title case
 */
export function titleCase(str: string): string {
	return str.replace(/\w\S*/g, (txt) =>
		txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
	)
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
	if (text.length <= maxLength) return text
	return text.substring(0, maxLength - suffix.length) + suffix
}

/**
 * Escape HTML characters
 */
export function escapeHtml(text: string): string {
	const div = document.createElement('div')
	div.textContent = text
	return div.innerHTML
}

/**
 * Strip HTML tags from text
 */
export function stripHtml(html: string): string {
	const tmp = document.createElement('div')
	tmp.innerHTML = html
	return tmp.textContent || tmp.innerText || ''
}

/**
 * Format URL for display
 */
export function formatUrl(url: string, maxLength: number = 50): string {
	try {
		const urlObj = new URL(url)
		const display = urlObj.hostname + urlObj.pathname
		return display.length > maxLength ?
			display.substring(0, maxLength - 3) + '...' :
			display
	} catch {
		return url.length > maxLength ?
			url.substring(0, maxLength - 3) + '...' :
			url
	}
}

/**
 * Format a list of items
 */
export function formatList(items: string[], conjunction: string = 'and'): string {
	if (items.length === 0) return ''
	if (items.length === 1) return items[0]
	if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`

	return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

/**
 * Format a phone number
 */
export function formatPhoneNumber(phone: string): string {
	// Remove all non-numeric characters
	const cleaned = phone.replace(/\D/g, '')

	// Check if it's a valid US phone number
	if (cleaned.length === 10) {
		return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
	}

	if (cleaned.length === 11 && cleaned.startsWith('1')) {
		return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
	}

	// Return original if not a standard format
	return phone
}

/**
 * Format a credit card number
 */
export function formatCreditCard(cardNumber: string): string {
	const cleaned = cardNumber.replace(/\D/g, '')
	const groups = cleaned.match(/\d{4}/g) || []
	return groups.join(' ')
}

/**
 * Format a color value
 */
export function formatColor(color: string): string {
	// If already in hex format, return as is
	if (color.startsWith('#')) return color

	// Convert rgb() to hex
	const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
	if (rgbMatch) {
		const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0')
		const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0')
		const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0')
		return `#${r}${g}${b}`
	}

	return color
}

/**
 * Safe JSON stringify with circular reference handling
 */
export function safeJsonStringify(obj: any, indent?: number): string {
	const cache = new Set()
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === 'object' && value !== null) {
			if (cache.has(value)) {
				return '[Circular]'
			}
			cache.add(value)
		}
		return value
	}, indent)
}

/**
 * Format bytes with appropriate units
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes'
	const k = 1024
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format count with abbreviation
 */
export function formatCount(num: number): string {
	if (num < 1000) return num.toString()
	if (num < 1000000) return (num / 1000).toFixed(1) + 'K'
	if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M'
	return (num / 1000000000).toFixed(1) + 'B'
}

/**
 * Format view count
 */
export function formatViewCount(views: number): string {
	return formatCount(views) + ' views'
}

/**
 * Format like count
 */
export function formatLikeCount(likes: number): string {
	return formatCount(likes) + ' likes'
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date | string | number): string {
	const now = new Date()
	const inputDate = new Date(date)
	const diffInSeconds = Math.floor((now.getTime() - inputDate.getTime()) / 1000)

	if (diffInSeconds < 60) return 'just now'
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
	if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`
	if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`
	return `${Math.floor(diffInSeconds / 31536000)} years ago`
}