const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
  }
})

import { saveReport, getReport, saveReportPdf, getReportPdf } from '@/lib/r2'
import type { ReportData } from '@/lib/types'

// Mock environment variables
process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY_ID = 'test-key'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
process.env.R2_BUCKET_NAME = 'test-bucket'

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
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('stores report in R2', async () => {
    await saveReport('abc123', MOCK_REPORT)
    expect(mockSend).toHaveBeenCalled()
  })
})

describe('getReport', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('returns report when found', async () => {
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: jest.fn().mockResolvedValue(JSON.stringify(MOCK_REPORT)),
      },
    })
    const result = await getReport('abc123')
    expect(result?.summary).toBe('Test')
  })

  it('returns null when not found (NoSuchKey)', async () => {
    const error = new Error('Not Found')
    error.name = 'NoSuchKey'
    mockSend.mockRejectedValueOnce(error)
    const result = await getReport('missing')
    expect(result).toBeNull()
  })

  it('returns null when stored data fails schema validation (drift)', async () => {
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToString: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ summary: 'stale', candidates: [] })),
      },
    })
    const result = await getReport('drifted')
    expect(result).toBeNull()
  })
})

describe('saveReportPdf', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('stores pdf buffer in R2', async () => {
    await saveReportPdf('abc123', Buffer.from('PDF-DATA'))
    expect(mockSend).toHaveBeenCalled()
  })
})

describe('getReportPdf', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('returns Buffer when pdf exists', async () => {
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])), // %PDF
      },
    })
    const result = await getReportPdf('abc123')
    expect(result).toBeInstanceOf(Buffer)
    expect(result?.toString()).toBe('%PDF')
  })

  it('returns null when not found (NoSuchKey)', async () => {
    const error = new Error('Not Found')
    error.name = 'NoSuchKey'
    mockSend.mockRejectedValueOnce(error)
    const result = await getReportPdf('missing')
    expect(result).toBeNull()
  })
})
