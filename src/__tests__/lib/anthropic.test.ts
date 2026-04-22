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

import { parseReport, parseProposals, generateCandidates } from '@/lib/anthropic'
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
