import { describe, expect, it, vi } from 'vitest'

vi.mock('../pricing', () => {
	return {
		calculateLlmCost: vi.fn(async () => {
			throw new Error('Pricing rule not found for llm (model=default)')
		}),
		calculateAsrCost: vi.fn(async () => {
			throw new Error('Pricing rule not found for asr (model=default)')
		}),
		calculateDownloadCost: vi.fn(async () => {
			throw new Error('Pricing rule not found for download (model=default)')
		}),
	}
})

import { chargeAsrUsage, chargeDownloadUsage, chargeLlmUsage } from '../billing'

describe('billing (strict pricing)', () => {
	it('throws when LLM pricing rule is missing', async () => {
		await expect(
			chargeLlmUsage({
				userId: 'u1',
				modelId: 'm1',
				inputTokens: 100,
				outputTokens: 50,
			}),
		).rejects.toThrow(/Pricing rule not found/)
	})

	it('throws when ASR pricing rule is missing', async () => {
		await expect(
			chargeAsrUsage({
				userId: 'u1',
				modelId: 'asr1',
				durationSeconds: 12,
			}),
		).rejects.toThrow(/Pricing rule not found/)
	})

	it('throws when download pricing rule is missing', async () => {
		await expect(
			chargeDownloadUsage({
				userId: 'u1',
				durationSeconds: 12,
			}),
		).rejects.toThrow(/Pricing rule not found/)
	})
})

