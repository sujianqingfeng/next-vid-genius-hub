import { describe, expect, it } from 'vitest'
import {
	pickBestSuccessProxyId,
	type SuccessProxyCandidate,
} from '../pick-best-success-proxy'

describe('pickBestSuccessProxyId', () => {
	it('returns null when empty', () => {
		expect(pickBestSuccessProxyId([])).toBeNull()
	})

	it('prefers lower responseTime', () => {
		const input: SuccessProxyCandidate[] = [
			{ id: 'a', responseTime: 120, createdAt: new Date('2025-01-01') },
			{ id: 'b', responseTime: 50, createdAt: new Date('2025-01-02') },
		]
		expect(pickBestSuccessProxyId(input)).toBe('b')
	})

	it('treats null responseTime as worst', () => {
		const input: SuccessProxyCandidate[] = [
			{ id: 'a', responseTime: null, createdAt: new Date('2025-01-02') },
			{ id: 'b', responseTime: 80, createdAt: new Date('2025-01-01') },
		]
		expect(pickBestSuccessProxyId(input)).toBe('b')
	})

	it('breaks ties by newest createdAt', () => {
		const input: SuccessProxyCandidate[] = [
			{ id: 'a', responseTime: 80, createdAt: new Date('2025-01-01') },
			{ id: 'b', responseTime: 80, createdAt: new Date('2025-01-03') },
			{ id: 'c', responseTime: 80, createdAt: new Date('2025-01-02') },
		]
		expect(pickBestSuccessProxyId(input)).toBe('b')
	})
})
