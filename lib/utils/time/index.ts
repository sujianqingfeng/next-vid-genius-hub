/**
 * Consolidated time utility functions
 * Combines general time utilities with subtitle-specific functions
 */

// Re-export all subtitle-specific time functions
export * from '../../subtitle/utils/time'

// Re-export additional general time functions not in subtitle utils
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

export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export function debounce<T extends (...args: unknown[]) => unknown>(
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

export function throttle<T extends (...args: unknown[]) => unknown>(
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

export function msToSeconds(ms: number): number {
	return ms / 1000
}

export function secondsToMs(seconds: number): number {
	return seconds * 1000
}

export function getCurrentTimestamp(): number {
	return Date.now() / 1000
}

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

export function isWithinLast(date: Date, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): boolean {
	const now = new Date()
	const past = addTime(now, -amount, unit)
	return date >= past
}