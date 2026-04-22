let mockCreate: jest.Mock

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn().mockImplementation(() => ({
      messages: { create: (...args: unknown[]) => mockCreate(...args) },
    })),
    {
      RateLimitError: class RateLimitError extends Error { status = 429 },
      AuthenticationError: class AuthenticationError extends Error { status = 401 },
      APIError: class APIError extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
    }
  ),
}))

import { parseReport, parseProposals, generateCandidates, synthesiseReport } from '@/lib/anthropic'
import type { ReportData } from '@/lib/types'

const VALID_REPORT: ReportData = {
  summary: 'A test product',
  candidates: [
    {
      name: 'TestBrand',
      style: 'invented',
      rationale: 'Works well',
      trademarkRisk: 'low',
      trademarkNotes: 'No conflicts found',
      domains: { com: 'likely available', io: 'uncertain', co: 'likely taken', alternates: [] },
    },
  ],
  topPicks: [{ name: 'TestBrand', reasoning: 'Best option', nextSteps: 'Check USPTO' }],
  recommendation: 'Go with TestBrand',
}

const MOCK_PROPOSALS = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Good rationale.',
}))

const VALID_PROPOSALS = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Strategic rationale here.',
}))

function makeTextResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

describe('parseReport', () => {
  it('parses clean JSON', () => {
    const result = parseReport(JSON.stringify(VALID_REPORT))
    expect(result.candidates[0].name).toBe('TestBrand')
    expect(result.topPicks).toHaveLength(1)
  })

  it('strips markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID_REPORT)}\n\`\`\``
    expect(parseReport(fenced).summary).toBe('A test product')
  })

  it('extracts JSON from surrounding text', () => {
    const wrapped = `Here is the result: ${JSON.stringify(VALID_REPORT)} done.`
    expect(parseReport(wrapped).candidates).toHaveLength(1)
  })

  it('throws on unparseable input', () => {
    expect(() => parseReport('not json at all')).toThrow()
  })
})

describe('parseProposals', () => {
  it('parses a valid JSON array', () => {
    const result = parseProposals(JSON.stringify(VALID_PROPOSALS))
    expect(result).toHaveLength(8)
    expect(result[0].name).toBe('Brand0')
    expect(result[0].style).toBe('invented')
  })

  it('strips markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID_PROPOSALS)}\n\`\`\``
    expect(parseProposals(fenced)).toHaveLength(8)
  })

  it('extracts array from surrounding text', () => {
    const wrapped = `Here are the candidates: ${JSON.stringify(VALID_PROPOSALS)} done.`
    expect(parseProposals(wrapped)).toHaveLength(8)
  })

  it('throws when fewer than 5 candidates returned', () => {
    const tooFew = VALID_PROPOSALS.slice(0, 3)
    expect(() => parseProposals(JSON.stringify(tooFew))).toThrow('Too few candidates: 3')
  })

  it('throws when no array found', () => {
    expect(() => parseProposals('not an array at all')).toThrow('No JSON array found')
  })
})

describe('generateCandidates', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
  })

  it('returns CandidateProposal[] on success', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_PROPOSALS)))

    const result = await generateCandidates({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(result).toHaveLength(8)
    expect(result[0].name).toBe('Brand0')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6', tools: undefined })
    )
  })

  it('throws when model returns fewer than 5 candidates', async () => {
    const tooFew = MOCK_PROPOSALS.slice(0, 3)
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(tooFew)))

    await expect(
      generateCandidates({ description: 'x', personality: 'y', constraints: '', geography: 'z' })
    ).rejects.toThrow('Too few candidates')
  })

  it('throws when model returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 'x', name: 'web_search', input: {} }] })

    await expect(
      generateCandidates({ description: 'x', personality: 'y', constraints: '', geography: 'z' })
    ).rejects.toThrow('no text block')
  })
})

import type { TrademarkCheckResult } from '@/lib/signa'
import type { DomainAvailability } from '@/lib/types'

const MOCK_TRADEMARK: TrademarkCheckResult = {
  candidateName: 'Brand0',
  risk: 'low',
  notes: 'No conflicts found.',
  sources: ['Signa (USPTO + EUIPO)'],
}

const MOCK_DOMAINS: DomainAvailability = {
  com: 'likely available',
  io: 'uncertain',
  co: 'likely taken',
  alternates: [],
}

const VERIFIED = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Good rationale.',
  trademark: { ...MOCK_TRADEMARK, candidateName: `Brand${i}` },
  domains: MOCK_DOMAINS,
}))

const MOCK_FULL_REPORT: ReportData = {
  summary: 'A SaaS tool for developers.',
  candidates: VERIFIED.map((v) => ({
    name: v.name,
    style: v.style,
    rationale: v.rationale,
    trademarkRisk: 'low',
    trademarkNotes: 'No conflicts found.',
    domains: v.domains,
  })),
  topPicks: [
    { name: 'Brand0', reasoning: 'Best option.', nextSteps: 'File USPTO application.' },
    { name: 'Brand1', reasoning: 'Second best.', nextSteps: 'Check EUIPO.' },
    { name: 'Brand2', reasoning: 'Third option.', nextSteps: 'Check domain.' },
  ],
  recommendation: 'Go with Brand0.',
}

describe('synthesiseReport', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
  })

  it('returns validated ReportData on success', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    const result = await synthesiseReport(
      { description: 'A SaaS tool', personality: 'Bold / contrarian', constraints: '', geography: 'Global' },
      VERIFIED
    )

    expect(result.candidates).toHaveLength(8)
    expect(result.topPicks).toHaveLength(3)
    expect(result.summary).toBe('A SaaS tool for developers.')
  })

  it('passes verified trademark and domain data in the user message', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    await synthesiseReport(
      { description: 'A SaaS tool', personality: 'Bold / contrarian', constraints: '', geography: 'Global' },
      VERIFIED
    )

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('Brand0')
    expect(callArgs.messages[0].content).toContain('No conflicts found')
    expect(callArgs.messages[0].content).toContain('likely available')
  })

  it('throws when model returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [] })

    await expect(
      synthesiseReport(
        { description: 'x', personality: 'y', constraints: '', geography: 'z' },
        VERIFIED
      )
    ).rejects.toThrow('no text block')
  })
})

jest.mock('@/lib/signa', () => ({
  checkAllTrademarks: jest.fn(),
}))
jest.mock('@/lib/dns', () => ({
  checkAllDomains: jest.fn(),
}))

import { checkAllTrademarks } from '@/lib/signa'
import { checkAllDomains } from '@/lib/dns'
import { generateReport } from '@/lib/anthropic'

describe('generateReport orchestrator', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
    ;(checkAllTrademarks as jest.Mock).mockResolvedValue(new Map())
    ;(checkAllDomains as jest.Mock).mockResolvedValue(new Map())
  })

  it('calls generateCandidates then verification then synthesiseReport', async () => {
    // Step 1 returns proposals
    mockCreate.mockResolvedValueOnce(
      makeTextResponse(JSON.stringify(MOCK_PROPOSALS))
    )
    // Step 3 returns full report
    mockCreate.mockResolvedValueOnce(
      makeTextResponse(JSON.stringify(MOCK_FULL_REPORT))
    )

    const result = await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(checkAllTrademarks).toHaveBeenCalledWith(MOCK_PROPOSALS, 42)
    expect(checkAllDomains).toHaveBeenCalledWith(MOCK_PROPOSALS)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.candidates).toHaveLength(8)
  })

  it('proceeds with uncertain data when Signa and DNS both fail', async () => {
    ;(checkAllTrademarks as jest.Mock).mockRejectedValue(new Error('Signa down'))
    ;(checkAllDomains as jest.Mock).mockRejectedValue(new Error('DNS down'))

    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_PROPOSALS)))
    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    const result = await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(result.candidates).toHaveLength(8)
  })
})
