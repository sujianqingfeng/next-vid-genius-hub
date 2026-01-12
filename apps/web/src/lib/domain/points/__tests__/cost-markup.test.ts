import { describe, expect, it } from 'vitest'
import {
	applyMarkupFen,
	derivePricingRuleFromCostMarkup,
	fenToPointsCeil,
	markupPercentToBps,
	rmbToFen,
} from '../cost-markup'

describe('cost+markup pricing derivation', () => {
	it('derives LLM micropoints/token from RMB cost and markup', () => {
		const markupBps = markupPercentToBps(25) // +25%
		const derived = derivePricingRuleFromCostMarkup({
			resourceType: 'llm',
			markupBps,
			costInputFenPer1M: rmbToFen(8),
			costOutputFenPer1M: rmbToFen(24),
			minChargeCostFen: rmbToFen(0.2),
		})

		expect(derived.resourceType).toBe('llm')
		expect(derived.unit).toBe('token')
		expect(derived.pricePerUnit).toBe(0)
		// 8.00 * 1.25 = 10.00 RMB => 1000 fen => 1000 µpoints/token (with 1 RMB = 100 points)
		expect(derived.inputPricePerUnit).toBe(1000)
		// 24.00 * 1.25 = 30.00 RMB => 3000 fen => 3000 µpoints/token
		expect(derived.outputPricePerUnit).toBe(3000)
		// 0.20 * 1.25 = 0.25 RMB => 25 fen => 25 points
		expect(derived.minCharge).toBe(25)
	})

	it('derives ASR/download points/minute and rounds up to avoid undercharging', () => {
		const markupBps = markupPercentToBps(20) // +20%

		const derived = derivePricingRuleFromCostMarkup({
			resourceType: 'asr',
			markupBps,
			costFenPerMinute: rmbToFen(0.01),
		})

		expect(derived.resourceType).toBe('asr')
		expect(derived.unit).toBe('minute')
		// 0.01 RMB/min => 1 fen/min; 1 * 1.2 => 1.2 => ceil => 2 fen => 2 points/min
		expect(derived.pricePerUnit).toBe(2)
	})

	it('applies markup in fen and converts to points (ceil)', () => {
		const sellFen = applyMarkupFen(101, 1) // 1.01 RMB with +0.01% => 101.0101... => ceil => 102 fen
		expect(sellFen).toBe(102)

		const points = fenToPointsCeil(sellFen)
		expect(points).toBe(102)
	})
})

