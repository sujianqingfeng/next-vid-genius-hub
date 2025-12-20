import { describe, expect, it } from 'vitest'
import { calculateLlmCost } from '../pricing'

describe('calculateLlmCost (micropoints/token)', () => {
	it('charges ceil(micropoints / 1e6) points', async () => {
		const rule = {
			id: 'r1',
			resourceType: 'llm',
			providerId: 'p1',
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
				aiModels: {
					findFirst: async () => ({ id: 'm1', kind: 'llm', providerId: 'p1' }),
				},
				pointPricingRules: {
					findMany: async () => [rule],
				},
			},
		}

		const res = await calculateLlmCost({
			modelId: 'm1',
			inputTokens: 1000,
			outputTokens: 500,
			db: db as unknown as never,
		})

		// raw µpoints = 1000*800 + 500*2400 = 2_000_000 => 2 points
		expect(res.totalTokens).toBe(1500)
		expect(res.points).toBe(2)
	})

	it('applies minCharge in points', async () => {
		const rule = {
			id: 'r1',
			resourceType: 'llm',
			providerId: 'p1',
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
				aiModels: {
					findFirst: async () => ({ id: 'm1', kind: 'llm', providerId: 'p1' }),
				},
				pointPricingRules: {
					findMany: async () => [rule],
				},
			},
		}

		const res = await calculateLlmCost({
			modelId: 'm1',
			inputTokens: 1,
			outputTokens: 0,
			db: db as unknown as never,
		})

		expect(res.points).toBe(3)
	})

	it('falls back to provider default then global default', async () => {
		const providerDefault = {
			id: 'r-provider',
			resourceType: 'llm',
			providerId: 'p1',
			modelId: null,
			unit: 'token',
			pricePerUnit: 0,
			inputPricePerUnit: 1000,
			outputPricePerUnit: 0,
			minCharge: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		const globalDefault = {
			id: 'r-global',
			resourceType: 'llm',
			providerId: null,
			modelId: null,
			unit: 'token',
			pricePerUnit: 0,
			inputPricePerUnit: 1,
			outputPricePerUnit: 0,
			minCharge: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		const db = {
			query: {
				aiModels: {
					findFirst: async () => ({ id: 'm1', kind: 'llm', providerId: 'p1' }),
				},
				pointPricingRules: {
					findMany: async () => [providerDefault, globalDefault],
				},
			},
		}

		const res = await calculateLlmCost({
			modelId: 'm1',
			inputTokens: 1,
			outputTokens: 0,
			db: db as unknown as never,
		})

		// provider default uses 1000 µpoints/token => ceil(1000/1e6)=1 point
		expect(res.points).toBe(1)
		expect(res.rule.id).toBe('r-provider')
	})
})
