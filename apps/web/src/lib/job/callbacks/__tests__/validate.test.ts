import { describe, expect, it } from 'vitest'

import { OrchestratorCallbackV2Schema } from '../validate'

describe('OrchestratorCallbackV2Schema', () => {
	it('accepts a minimal v2 callback payload with outputs', () => {
		const parsed = OrchestratorCallbackV2Schema.safeParse({
			schemaVersion: 2,
			jobId: 'job_123',
			mediaId: 'media_123',
			status: 'completed',
			engine: 'renderer-remotion',
			purpose: 'render-comments',
			eventSeq: 1,
			eventId: 'job_123:1',
			eventTs: Date.now(),
			outputs: { video: { key: 'k', url: 'https://example.com/v.mp4' } },
		})
		expect(parsed.success).toBe(true)
	})

	it('rejects v2 callback payload that uses legacy top-level outputKey', () => {
		const parsed = OrchestratorCallbackV2Schema.safeParse({
			schemaVersion: 2,
			jobId: 'job_123',
			mediaId: 'media_123',
			status: 'completed',
			engine: 'renderer-remotion',
			purpose: 'render-comments',
			eventSeq: 1,
			eventId: 'job_123:1',
			eventTs: Date.now(),
			outputKey: 'legacy',
			outputs: { video: { key: 'k' } },
		})
		expect(parsed.success).toBe(false)
	})

	it('rejects v2 callback payload that uses legacy top-level outputAudioKey', () => {
		const parsed = OrchestratorCallbackV2Schema.safeParse({
			schemaVersion: 2,
			jobId: 'job_123',
			mediaId: 'media_123',
			status: 'completed',
			engine: 'renderer-remotion',
			purpose: 'render-comments',
			eventSeq: 1,
			eventId: 'job_123:1',
			eventTs: Date.now(),
			outputAudioKey: 'legacy',
			outputs: { video: { key: 'k' } },
		})
		expect(parsed.success).toBe(false)
	})

	it('rejects v2 callback payload with mediaId=unknown', () => {
		const parsed = OrchestratorCallbackV2Schema.safeParse({
			schemaVersion: 2,
			jobId: 'job_123',
			mediaId: 'unknown',
			status: 'completed',
			engine: 'renderer-remotion',
			purpose: 'render-comments',
			eventSeq: 1,
			eventId: 'job_123:1',
			eventTs: Date.now(),
			outputs: { video: { key: 'k' } },
		})
		expect(parsed.success).toBe(false)
	})
})
