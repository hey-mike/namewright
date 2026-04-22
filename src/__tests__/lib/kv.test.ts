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
  candidates: [],
  topPicks: [],
  recommendation: '',
}

describe('saveReport', () => {
  it('stores report with 24-hour TTL', async () => {
    await saveReport('abc123', MOCK_REPORT)
    expect(kv.set).toHaveBeenCalledWith('report:abc123', MOCK_REPORT, { ex: 86400 })
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
})
