import { describe, expect, it, vi } from 'vitest'
import {
	fetchWhisperApiConfigFromNext,
	mapWhisperStatusToJobStatus,
	resolveWhisperProgressFraction,
} from '../whisper-api-jobs'

describe('whisper-api-jobs', () => {
	it('maps whisper job status to orchestrator status', () => {
		expect(mapWhisperStatusToJobStatus('queued')).toBe('queued')
		expect(mapWhisperStatusToJobStatus('running')).toBe('running')
		expect(mapWhisperStatusToJobStatus('succeeded')).toBe('completed')
		expect(mapWhisperStatusToJobStatus('failed')).toBe('failed')
	})

	it('normalizes progress to 0..1', () => {
		expect(resolveWhisperProgressFraction({ id: '1', status: 'running', progress: 0 })).toBe(0)
		expect(resolveWhisperProgressFraction({ id: '1', status: 'running', progress: 0.5 })).toBe(0.5)
		expect(resolveWhisperProgressFraction({ id: '1', status: 'running', progress: 50 })).toBe(0.5)
		expect(resolveWhisperProgressFraction({ id: '1', status: 'running', progress: 100 })).toBe(1)
		expect(resolveWhisperProgressFraction({ id: '1', status: 'running', progress: -10 })).toBe(0)
	})

	it('fetches whisper_api config from Next with HMAC header', async () => {
		const env = {
			NEXT_BASE_URL: 'http://localhost:3000',
			JOB_CALLBACK_HMAC_SECRET: 'test-secret',
		} as any

		const fetchSpy = vi.fn(async (input: any, init?: any) => {
			expect(String(input)).toBe('http://localhost:3000/api/internal/ai/asr-provider')
			expect(init?.method).toBe('POST')
			expect(init?.headers?.['x-signature']).toMatch(/^[0-9a-f]{64}$/)
			return new Response(
				JSON.stringify({
					type: 'whisper_api',
					baseUrl: 'http://whisper.example',
					apiKey: 'token',
					remoteModelId: 'distil-large-v3',
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)
		})

		vi.stubGlobal('fetch', fetchSpy as any)
		try {
			const cfg = await fetchWhisperApiConfigFromNext(env, {
				providerId: 'p1',
				modelId: 'whisper/distil-large-v3',
			})
			expect(cfg).toEqual({
				baseUrl: 'http://whisper.example',
				apiKey: 'token',
				remoteModelId: 'distil-large-v3',
			})
		} finally {
			vi.unstubAllGlobals()
		}
	})
})

