/**
 * Time-related utility functions
 */

/**
 * Format seconds to human-readable time (HH:MM:SS)
 */
export function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)

	if (hours > 0) {
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
	}
	return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format seconds to subtitle timestamp format (HH:MM:SS,mmm)
 */
export function formatSubtitleTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const ms = Math.floor((seconds % 1) * 1000)

	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

/**
 * Parse time string to seconds
 * Supports formats: "HH:MM:SS", "MM:SS", "HH:MM:SS,mmm", "MM:SS,mmm"
 */
export function parseTime(timeString: string): number {
	// Remove any whitespace
	const cleanTime = timeString.trim()

	// Handle subtitle format with milliseconds
	if (cleanTime.includes(',')) {
		const [timePart, msPart] = cleanTime.split(',')
		const seconds = parseTime(timePart)
		const ms = parseInt(msPart, 10) || 0
		return seconds + (ms / 1000)
	}

	const parts = cleanTime.split(':').map(Number)

	if (parts.length === 3) {
		// HH:MM:SS
		return parts[0] * 3600 + parts[1] * 60 + parts[2]
	} else if (parts.length === 2) {
		// MM:SS
		return parts[0] * 60 + parts[1]
	}

	return 0
}

/**
 * Get time ago string (e.g., "2 hours ago", "3 days ago")
 */
export function getTimeAgo(date: Date | string | number): string {
	const now = new Date()
	const past = new Date(date)
	const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

	if (diffInSeconds < 60) {
		return 'just now'
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60)
	if (diffInMinutes < 60) {
		return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`
	}

	const diffInHours = Math.floor(diffInMinutes / 60)
	if (diffInHours < 24) {
		return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
	}

	const diffInDays = Math.floor(diffInHours / 24)
	if (diffInDays < 30) {
		return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
	}

	const diffInMonths = Math.floor(diffInDays / 30)
	if (diffInMonths < 12) {
		return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`
	}

	const diffInYears = Math.floor(diffInDays / 365)
	return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`
}

/**
 * Format duration in a human-readable way
 */
export function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`
	}

	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) {
		const remainingSeconds = Math.floor(seconds % 60)
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
	}

	const hours = Math.floor(minutes / 60)
	const remainingMinutes = minutes % 60
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null

	return (...args: Parameters<T>) => {
		if (timeout) {
			clearTimeout(timeout)
		}
		timeout = setTimeout(() => func(...args), wait)
	}
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle = false

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args)
			inThrottle = true
			setTimeout(() => {
				inThrottle = false
			}, limit)
		}
	}
}

/**
 * Convert milliseconds to seconds
 */
export function msToSeconds(ms: number): number {
	return ms / 1000
}

/**
 * Convert seconds to milliseconds
 */
export function secondsToMs(seconds: number): number {
	return seconds * 1000
}

/**
 * Get current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
	return Date.now() / 1000
}

/**
 * Add time to a date
 */
export function addTime(date: Date, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): Date {
	const result = new Date(date)

	switch (unit) {
		case 'seconds':
			result.setSeconds(result.getSeconds() + amount)
			break
		case 'minutes':
			result.setMinutes(result.getMinutes() + amount)
			break
		case 'hours':
			result.setHours(result.getHours() + amount)
			break
		case 'days':
			result.setDate(result.getDate() + amount)
			break
	}

	return result
}

/**
 * Check if a date is within the last n units
 */
export function isWithinLast(date: Date, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): boolean {
	const now = new Date()
	const past = addTime(now, -amount, unit)
	return date >= past
}