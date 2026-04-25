jest.mock('@vercel/kv', () => ({
  kv: {
    set: jest.fn(),
    get: jest.fn(),
  },
}))

import { kv } from '@vercel/kv'
import { saveReport, getReport } from '@/lib/kv'
import type { ReportData } from '@/lib/types'

const MOCK_REPORT: ReportData = {
  summary: 'Test',
  candidates: [
    {
      name: 'Brand0',
      style: 'invented',
      rationale: 'Strategic rationale.',
      trademarkRisk: 'low',
      trademarkNotes: 'No conflicts.',
      domains: { tlds: { com: 'available' }, alternates: [] },
    },
  ],
  topPicks: [{ name: 'Brand0', reasoning: 'Best.', nextSteps: 'File USPTO.' }],
  recommendation: 'Go with Brand0.',
}

describe('saveReport', () => {
  it('stores report with 7-day TTL', async () => {
    await saveReport('abc123', MOCK_REPORT)
    expect(kv.set).toHaveBeenCalledWith('report:abc123', MOCK_REPORT, { ex: 604800 })
  })
})

describe('getReport', () => {
  it('returns report when found', async () => {
    ;(kv.get as jest.Mock).mockResolvedValueOnce(MOCK_REPORT)
    const result = await getReport('abc123')
    expect(result?.summary).toBe('Test')
  })

  it('returns null when not found', async () => {
    ;(kv.get as jest.Mock).mockResolvedValueOnce(null)
    const result = await getReport('missing')
    expect(result).toBeNull()
  })

  it('returns null when stored data fails schema validation (drift)', async () => {
    // Simulate a partial write or shape from an older app version sitting in KV.
    ;(kv.get as jest.Mock).mockResolvedValueOnce({ summary: 'stale', candidates: [] })
    const result = await getReport('drifted')
    expect(result).toBeNull()
  })
})
