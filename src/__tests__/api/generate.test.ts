jest.mock('@/lib/anthropic', () => ({
  generateReport: jest.fn(),
  getErrorStage: jest.fn(() => undefined),
}))
jest.mock('@/lib/kv', () => ({
  saveReport: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))
jest.mock('@/lib/alerts', () => ({
  notifySlack: jest.fn(),
}))

import Anthropic from '@anthropic-ai/sdk'
import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { notifySlack } from '@/lib/alerts'
import { POST } from '@/app/api/generate/route'

const MOCK_REPORT = {
  summary: 'A SaaS tool',
  candidates: Array.from({ length: 10 }, (_, i) => ({
    name: `Brand${i}`,
    style: 'invented',
    rationale: 'Good',
    trademarkRisk: 'low',
    trademarkNotes: 'Clear',
    domains: { tlds: { com: 'available', io: 'uncertain', co: 'likely taken' }, alternates: [] },
  })),
  topPicks: [
    { name: 'Brand0', reasoning: 'Best', nextSteps: 'Check USPTO' },
    { name: 'Brand1', reasoning: 'Second', nextSteps: 'Check EUIPO' },
    { name: 'Brand2', reasoning: 'Third', nextSteps: 'Check both' },
  ],
  recommendation: 'Go with Brand0',
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    ;(generateReport as jest.Mock).mockResolvedValue(MOCK_REPORT)
    ;(saveReport as jest.Mock).mockResolvedValue(undefined)
    ;(notifySlack as jest.Mock).mockClear()
    ;(notifySlack as jest.Mock).mockResolvedValue(undefined)
  })

  it('returns reportId and exactly 3 preview candidates', async () => {
    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.reportId).toBeDefined()
    expect(json.preview).toHaveLength(3)
    expect(json.summary).toBe('A SaaS tool')
  })

  it('saves the full report to KV', async () => {
    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    await POST(req)
    expect(saveReport).toHaveBeenCalledWith(expect.any(String), MOCK_REPORT)
  })

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest({ description: 'only this' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/generate — error branches', () => {
  const validBody = {
    description: 'A B2B SaaS for distributed engineering teams',
    personality: 'Premium / refined',
    geography: 'Global',
  }

  beforeEach(() => {
    ;(generateReport as jest.Mock).mockResolvedValue(MOCK_REPORT)
    ;(saveReport as jest.Mock).mockResolvedValue(undefined)
    ;(notifySlack as jest.Mock).mockClear()
    ;(notifySlack as jest.Mock).mockResolvedValue(undefined)
  })

  it('returns 502 with a retry-friendly message when Anthropic rate-limits the request', async () => {
    const rateLimitErr = new Anthropic.RateLimitError(
      429,
      { error: { type: 'rate_limit_error', message: 'rate limited' } },
      'rate limited',
      new Headers()
    )
    ;(generateReport as jest.Mock).mockRejectedValue(rateLimitErr)

    const res = await POST(makeRequest(validBody))
    const json = (await res.json()) as { error: string }

    expect(res.status).toBe(502)
    expect(json.error).toContain('high demand')
  })

  it('returns 502 and pages on-call when Anthropic credit balance is exhausted', async () => {
    const creditErr = new Anthropic.APIError(
      400,
      { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } },
      'Your credit balance is too low to access the Anthropic API',
      new Headers()
    )
    ;(generateReport as jest.Mock).mockRejectedValue(creditErr)

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(502)
    expect(notifySlack).toHaveBeenCalledTimes(1)
    const call = (notifySlack as jest.Mock).mock.calls[0][0] as {
      severity: string
      title: string
    }
    expect(call.severity).toBe('critical')
    expect(call.title).toContain('credit balance')
  })

  it('returns 503 and pages on-call when KV save fails after a successful generation', async () => {
    ;(saveReport as jest.Mock).mockRejectedValue(new Error('KV write timed out'))

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(503)
    expect(notifySlack).toHaveBeenCalledTimes(1)
    const call = (notifySlack as jest.Mock).mock.calls[0][0] as {
      severity: string
      title: string
    }
    expect(call.severity).toBe('critical')
    expect(call.title).toContain('KV save failed')
  })
})
