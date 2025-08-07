import { describe, expect, it } from 'vitest'
import {
	formatCurrency,
	formatDate,
	formatDuration,
	formatFileSize,
	formatLikes,
	formatNumber,
	formatPercentage,
	formatTimeAgo,
	formatViewCount,
} from '../format'

describe('formatNumber', () => {
	it('should format numbers with K suffix', () => {
		expect(formatNumber(1500)).toBe('1.5K')
		expect(formatNumber(9999)).toBe('10.0K')
	})

	it('should format numbers with M suffix', () => {
		expect(formatNumber(1500000)).toBe('1.5M')
		expect(formatNumber(9999999)).toBe('10.0M')
	})

	it('should format numbers with B suffix when includeBillion is true', () => {
		expect(formatNumber(1500000000)).toBe('1.5B')
		expect(formatNumber(2500000000)).toBe('2.5B')
	})

	it('should not format numbers with B suffix when includeBillion is false', () => {
		expect(formatNumber(1500000000, { includeBillion: false })).toBe('1500.0M')
	})

	it('should handle small numbers', () => {
		expect(formatNumber(123)).toBe('123')
		expect(formatNumber(0)).toBe('0')
	})

	it('should respect decimal places option', () => {
		expect(formatNumber(1500, { decimals: 0 })).toBe('2K')
		expect(formatNumber(1500, { decimals: 2 })).toBe('1.50K')
	})
})

describe('formatViewCount', () => {
	it('should format view counts with B suffix', () => {
		expect(formatViewCount(1500000000)).toBe('1.5B')
		expect(formatViewCount(2500000000)).toBe('2.5B')
	})

	it('should format view counts with M suffix', () => {
		expect(formatViewCount(1500000)).toBe('1.5M')
		expect(formatViewCount(9999999)).toBe('10.0M')
	})

	it('should format view counts with K suffix', () => {
		expect(formatViewCount(1500)).toBe('1.5K')
		expect(formatViewCount(9999)).toBe('10.0K')
	})
})

describe('formatLikes', () => {
	it('should format likes without B suffix', () => {
		expect(formatLikes(1500000000)).toBe('1500.0M')
		expect(formatLikes(2500000000)).toBe('2500.0M')
	})

	it('should format likes with M suffix', () => {
		expect(formatLikes(1500000)).toBe('1.5M')
		expect(formatLikes(9999999)).toBe('10.0M')
	})

	it('should format likes with K suffix', () => {
		expect(formatLikes(1500)).toBe('1.5K')
		expect(formatLikes(9999)).toBe('10.0K')
	})
})

describe('formatTimeAgo', () => {
	it('should format recent times', () => {
		const now = new Date()
		const oneMinuteAgo = new Date(now.getTime() - 30 * 1000)
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

		expect(formatTimeAgo(oneMinuteAgo)).toBe('Just now')
		expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago')
		expect(formatTimeAgo(oneHourAgo)).toBe('1h ago')
	})

	it('should format older times', () => {
		const now = new Date()
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
		const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

		expect(formatTimeAgo(oneDayAgo)).toBe('1d ago')
		expect(formatTimeAgo(oneMonthAgo)).toBe('1mo ago')
	})
})

describe('formatDuration', () => {
	it('should format short durations', () => {
		expect(formatDuration(65)).toBe('01:05')
		expect(formatDuration(125)).toBe('02:05')
		expect(formatDuration(0)).toBe('00:00')
	})

	it('should format long durations with hours', () => {
		expect(formatDuration(3665)).toBe('01:01:05')
		expect(formatDuration(7325)).toBe('02:02:05')
	})
})

describe('formatFileSize', () => {
	it('should format file sizes correctly', () => {
		expect(formatFileSize(0)).toBe('0 Bytes')
		expect(formatFileSize(1024)).toBe('1 KB')
		expect(formatFileSize(1024 * 1024)).toBe('1 MB')
		expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
	})

	it('should handle decimal file sizes', () => {
		expect(formatFileSize(1536)).toBe('1.5 KB')
		expect(formatFileSize(1536 * 1024)).toBe('1.5 MB')
	})
})

describe('formatDate', () => {
	it('should format dates without time', () => {
		const date = new Date('2023-12-25')
		const result = formatDate(date)
		expect(result).toMatch(/Dec 25, 2023/)
	})

	it('should format dates with time', () => {
		const date = new Date('2023-12-25T10:30:00')
		const result = formatDate(date, { includeTime: true })
		expect(result).toMatch(/Dec 25, 2023/)
		expect(result).toMatch(/10:30/)
	})

	it('should format relative dates', () => {
		const today = new Date()
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
		const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)

		expect(formatDate(today, { relative: true })).toBe('Today')
		expect(formatDate(yesterday, { relative: true })).toBe('Yesterday')
		expect(formatDate(twoDaysAgo, { relative: true })).toBe('2 days ago')
	})
})

describe('formatPercentage', () => {
	it('should format percentages correctly', () => {
		expect(formatPercentage(0.5)).toBe('50.0%')
		expect(formatPercentage(0.123)).toBe('12.3%')
		expect(formatPercentage(1)).toBe('100.0%')
	})

	it('should respect decimal places', () => {
		expect(formatPercentage(0.123, 2)).toBe('12.30%')
		expect(formatPercentage(0.5, 0)).toBe('50%')
	})
})

describe('formatCurrency', () => {
	it('should format USD currency', () => {
		expect(formatCurrency(1234.56)).toBe('$1,234.56')
		expect(formatCurrency(1000000)).toBe('$1,000,000.00')
	})

	it('should format other currencies', () => {
		expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56')
		expect(formatCurrency(1234.56, 'GBP')).toBe('£1,234.56')
	})
})
