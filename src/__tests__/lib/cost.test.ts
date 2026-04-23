import { computeAnthropicCostUsd } from '@/lib/cost'

describe('computeAnthropicCostUsd', () => {
  it('computes Sonnet 4.6 cost from input + output tokens', () => {
    const cost = computeAnthropicCostUsd('claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    })
    // $3 input + $15 output = $18 per million each
    expect(cost).toBeCloseTo(18, 4)
  })

  it('handles fractional millions correctly', () => {
    const cost = computeAnthropicCostUsd('claude-sonnet-4-6', {
      input_tokens: 1_500,
      output_tokens: 500,
    })
    // 1500 / 1M * $3 + 500 / 1M * $15 = 0.0045 + 0.0075 = 0.012
    expect(cost).toBeCloseTo(0.012, 6)
  })

  it('returns 0 for an unknown model rather than throwing', () => {
    const cost = computeAnthropicCostUsd('claude-future-7-0', {
      input_tokens: 1000,
      output_tokens: 1000,
    })
    expect(cost).toBe(0)
  })
})
