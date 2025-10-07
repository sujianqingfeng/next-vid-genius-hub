import { describe, expect, it } from 'vitest'
import {
	formatDuration,
	formatLikes,
	formatNumber,
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

