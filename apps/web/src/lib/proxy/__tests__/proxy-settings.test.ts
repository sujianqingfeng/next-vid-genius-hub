import { describe, expect, it } from 'vitest'
import { normalizeProxyCheckSettings } from '../proxy-settings'

describe('proxy check settings', () => {
	it('trims testUrl', () => {
		const normalized = normalizeProxyCheckSettings({
			testUrl: '  https://example.com/test.mp4  ',
			timeoutMs: 60_000,
			probeBytes: 65_536,
			concurrency: 5,
		})
		expect(normalized.testUrl).toBe('https://example.com/test.mp4')
	})

	it('clamps numeric fields', () => {
		const normalized = normalizeProxyCheckSettings({
			testUrl: '',
			timeoutMs: 0,
			probeBytes: 1,
			concurrency: 999,
		})
		expect(normalized.timeoutMs).toBe(1_000)
		expect(normalized.probeBytes).toBe(1_024)
		expect(normalized.concurrency).toBe(20)
	})
})
