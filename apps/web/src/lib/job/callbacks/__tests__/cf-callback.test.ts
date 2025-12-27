import { signHmacSHA256 } from '@app/job-callbacks'
import { describe, expect, it, vi } from 'vitest'

const mockDb = {
	query: {
		tasks: {
			findFirst: vi.fn(async () => null),
		},
	},
	update: vi.fn(() => ({
		set: vi.fn(() => ({
			where: vi.fn(async () => {}),
		})),
	})),
}

vi.mock('~/lib/db', async () => {
	const actual = await vi.importActual<typeof import('~/lib/db')>('~/lib/db')
	return {
		...actual,
		getDb: vi.fn(async () => mockDb),
	}
})

vi.mock('~/lib/job/events', () => ({
	recordJobEvent: vi.fn(async () => {}),
}))

vi.mock('../router', () => ({
	dispatchCfCallback: vi.fn(async () => ({
		response: Response.json({ ok: true }),
		shouldUpdateSnapshot: false,
	})),
}))

describe('handleCfCallbackRequest', () => {
	it('returns 200 for a valid signed callback', async () => {
		process.env.JOB_CALLBACK_HMAC_SECRET = 'test_secret'

		const payload = {
			schemaVersion: 2,
			jobId: 'job_123',
			mediaId: 'media_123',
			status: 'completed',
			engine: 'media-downloader',
			purpose: 'download',
			eventSeq: 1,
			eventId: 'job_123:1',
			eventTs: Date.now(),
			outputs: { video: { key: 'k' } },
		}

		const bodyText = JSON.stringify(payload)
		const signature = signHmacSHA256(process.env.JOB_CALLBACK_HMAC_SECRET, bodyText)

		const { handleCfCallbackRequest } = await import('../cf-callback')
		const res = await handleCfCallbackRequest(
			new Request('http://localhost/api/render/cf-callback', {
				method: 'POST',
				headers: { 'x-signature': signature },
				body: bodyText,
			}),
		)

		expect(res.status).toBe(200)
		await expect(res.json()).resolves.toEqual({ ok: true })
	})

	it('returns 200 (ignored) for invalid json to avoid retry storms', async () => {
		process.env.JOB_CALLBACK_HMAC_SECRET = 'test_secret'

		const bodyText = '{nope'
		const signature = signHmacSHA256(process.env.JOB_CALLBACK_HMAC_SECRET, bodyText)

		const { handleCfCallbackRequest } = await import('../cf-callback')
		const res = await handleCfCallbackRequest(
			new Request('http://localhost/api/render/cf-callback', {
				method: 'POST',
				headers: { 'x-signature': signature },
				body: bodyText,
			}),
		)

		expect(res.status).toBe(200)
		await expect(res.json()).resolves.toMatchObject({ ok: false, ignored: true })
	})
})

