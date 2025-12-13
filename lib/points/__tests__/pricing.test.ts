import { describe, expect, it } from 'vitest'
import { calculateLlmCost } from '../pricing'

describe('calculateLlmCost (micropoints/token)', () => {
	it('charges ceil(micropoints / 1e6) points', async () => {
		const rule = {
			id: 'r1',
			resourceType: 'llm',
			modelId: 'm1',
			unit: 'token',
			pricePerUnit: 0,
			inputPricePerUnit: 800, // 8.00 RMB / 1M tokens (with 10 RMB = 1000 pts)
			outputPricePerUnit: 2400, // 24.00 RMB / 1M tokens
			minCharge: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		const db = {
			query: {
				pointPricingRules: {
					findMany: async () => [rule],
				},
			},
		}

		const res = await calculateLlmCost({
			modelId: 'm1',
			inputTokens: 1000,
			outputTokens: 500,
			db: db as any,
		})

		// raw µpoints = 1000*800 + 500*2400 = 2_000_000 => 2 points
		expect(res.totalTokens).toBe(1500)
		expect(res.points).toBe(2)
	})

	it('applies minCharge in points', async () => {
		const rule = {
			id: 'r1',
			resourceType: 'llm',
			modelId: 'm1',
			unit: 'token',
			pricePerUnit: 0,
			inputPricePerUnit: 1,
			outputPricePerUnit: 0,
			minCharge: 3,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		const db = {
			query: {
				pointPricingRules: {
					findMany: async () => [rule],
				},
			},
		}

		const res = await calculateLlmCost({
			modelId: 'm1',
			inputTokens: 1,
			outputTokens: 0,
			db: db as any,
		})

		expect(res.points).toBe(3)
	})
})

