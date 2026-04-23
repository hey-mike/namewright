import logger from './logger'

// Per-million-token pricing for the Anthropic models we use. Update when
// pricing changes — costs are logged in USD using these rates.
// Source: https://docs.anthropic.com/en/docs/build-with-claude/models
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
}

interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function computeAnthropicCostUsd(model: string, usage: AnthropicUsage): number {
  const rates = PRICING_PER_MTOK[model]
  if (!rates) return 0
  const input = usage.input_tokens / 1_000_000
  const output = usage.output_tokens / 1_000_000
  return input * rates.input + output * rates.output
}

interface LogAnthropicUsageOpts {
  requestId?: string
  step: string
  model: string
  usage: AnthropicUsage
}

export function logAnthropicUsage(opts: LogAnthropicUsageOpts): void {
  const costUsd = computeAnthropicCostUsd(opts.model, opts.usage)
  logger.info(
    {
      event: 'llm_cost',
      requestId: opts.requestId,
      step: opts.step,
      model: opts.model,
      inputTokens: opts.usage.input_tokens,
      outputTokens: opts.usage.output_tokens,
      costUsd: Number(costUsd.toFixed(6)),
    },
    'llm cost'
  )
}

interface LogProviderUsageOpts {
  requestId?: string
  provider: string
  calls: number
  notes?: string
}

// Coarse usage counter for non-LLM providers (Signa, EUIPO, WhoisJSON, DNS).
// Per-call cost varies by tier; this just emits counts for the user to
// multiply by their own contracted rate.
export function logProviderUsage(opts: LogProviderUsageOpts): void {
  logger.info(
    {
      event: 'provider_usage',
      requestId: opts.requestId,
      provider: opts.provider,
      calls: opts.calls,
      notes: opts.notes,
    },
    'provider usage'
  )
}
