jest.mock('@/lib/anthropic', () => ({
  generateReport: jest.fn(),
}))
jest.mock('@/lib/kv', () => ({
  saveReport: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))

import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { POST } from '@/app/api/generate/route'

const MOCK_REPORT = {
  summary: 'A SaaS tool',
  candidates: Array.from({ length: 10 }, (_, i) => ({
    name: `Brand${i}`,
    style: 'invented',
    rationale: 'Good',
    trademarkRisk: 'low',
    trademarkNotes: 'Clear',
    domains: { com: 'likely available', io: 'uncertain', co: 'likely taken', alternates: [] },
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
