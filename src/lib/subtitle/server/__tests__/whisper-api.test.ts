import { describe, expect, it, vi } from 'vitest'
import { runWhisperApiAsr } from '../whisper-api'

describe('runWhisperApiAsr', () => {
	it('posts transcription request and builds vtt + words from segments', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				model: 'distil-large-v3',
				text: 'hello world',
				segments: [
					{
						start: 0,
						end: 1.5,
						text: 'Hello world.',
						words: [
							{ word: 'Hello', start: 0, end: 0.6, probability: 0.9 },
							{ word: 'world', start: 0.7, end: 1.5, probability: 0.9 },
						],
					},
				],
			}),
		})
		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		const res = await runWhisperApiAsr({
			baseUrl: 'https://vid.temp-drop-files.store/',
			apiKey: 'token',
			remoteModelId: 'distil-large-v3',
			audio: new Uint8Array([1, 2, 3]).buffer,
			language: 'en',
			filename: 'audio.mp3',
		})

		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			'https://vid.temp-drop-files.store/v1/audio/transcriptions',
		)
		const init = mockFetch.mock.calls[0]?.[1] as any
		expect(init?.method).toBe('POST')
		expect(init?.headers?.Authorization).toBe('Bearer token')
		expect(init?.body).toBeInstanceOf(FormData)
		const body = init.body as FormData
		expect(body.get('model')).toBe('distil-large-v3')
		expect(body.get('response_format')).toBe('json')
		expect(body.get('timestamp_granularities')).toBe('word')
		expect(body.get('language')).toBe('en')

		expect(res.vtt).toContain('WEBVTT')
		expect(res.vtt).toContain('00:00.000 --> 00:01.500')
		expect(res.vtt).toContain('Hello world.')
		expect(res.words).toEqual([
			{ word: 'Hello', start: 0, end: 0.6 },
			{ word: 'world', start: 0.7, end: 1.5 },
		])
	})

	it('throws a useful error on non-2xx', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => 'Unauthorized',
		})
		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		await expect(
			runWhisperApiAsr({
				baseUrl: 'https://vid.temp-drop-files.store',
				apiKey: 'bad-token',
				remoteModelId: 'distil-large-v3',
				audio: new Uint8Array([1, 2, 3]).buffer,
			}),
		).rejects.toThrow(/Whisper API ASR failed: 401/)
	})
})
