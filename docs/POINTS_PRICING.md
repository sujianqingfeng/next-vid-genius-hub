# Points pricing (LLM micropoints)

This project bills AI usage in **points** (积分) and records deductions in `point_transactions`.

## LLM pricing unit

LLM pricing is stored with **sub-point granularity**:

- `1 point = 1,000,000 µpoints (micro-points / 微积分)`
- In `point_pricing_rules`:
  - `resource_type = 'llm'`
  - `unit = 'token'`
  - `input_price_per_unit` and `output_price_per_unit` are **µpoints per token**
  - `min_charge` is still **points**

Charging logic:

- `cost_µpoints = inputTokens * inputµpointsPerToken + outputTokens * outputµpointsPerToken`
- `chargedPoints = max(ceil(cost_µpoints / 1_000_000), minChargePoints)`

See `lib/points/pricing.ts`.

## RMB helper (10 RMB = 1000 points)

If your business conversion is **10 RMB = 1000 points**:

- `1 RMB = 100 points`
- `RMB per 1,000,000 tokens = (µpoints per token) / 100`
- Example: `8 RMB / 1M input tokens` → `800 µpoints/token`

The admin UI shows this derived value for convenience.

