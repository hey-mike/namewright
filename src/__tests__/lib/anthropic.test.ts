let mockCreate: jest.Mock

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn().mockImplementation(() => ({
      messages: { create: (...args: unknown[]) => mockCreate(...args) },
    })),
    {
      RateLimitError: class RateLimitError extends Error {
        status = 429
      },
      AuthenticationError: class AuthenticationError extends Error {
        status = 401
      },
      APIError: class APIError extends Error {
        status: number
        constructor(s: number, m: string) {
          super(m)
          this.status = s
        }
      },
    }
  ),
}))

import {
  parseReport,
  parseProposals,
  generateCandidates,
  synthesiseReport,
  extractCitedMarks,
  validateGroundedMarks,
  validateStyleDistribution,
} from '@/lib/anthropic'
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
      domains: { tlds: { com: 'available', io: 'uncertain', co: 'likely taken' }, alternates: [] },
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

const MOCK_FILTERED_CANDIDATES = [
  { name: 'Rejected1', reason: 'Too generic.' },
  { name: 'Rejected2', reason: 'Trademark crowding.' },
  { name: 'Rejected3', reason: 'Phonetic ambiguity.' },
]

function makeToolResponse(name: string, input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'call_123', name, input }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function makeTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    // logAnthropicUsage reads usage from the response — provide stub values
    // so tests don't need to know about the cost-tracking layer.
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

describe('parseReport', () => {
  it('parses clean JSON', () => {
    const result = parseReport(VALID_REPORT)
    expect(result.candidates[0].name).toBe('TestBrand')
    expect(result.topPicks).toHaveLength(1)
  })
  it('throws on unparseable input', () => {
    expect(() => parseReport('not json at all')).toThrow()
  })

  it('strips trailing punctuation from candidate names', () => {
    const dirty = {
      ...VALID_REPORT,
      candidates: [{ ...VALID_REPORT.candidates[0], name: 'TestBrand.' }],
      topPicks: [{ ...VALID_REPORT.topPicks[0], name: 'TestBrand.' }],
    }
    expect(parseReport(dirty).candidates[0].name).toBe('TestBrand')
  })

  it('throws on Cyrillic homoglyphs in candidate names', () => {
    // "Cadенce" contains Cyrillic е (U+0435) and н (U+043D) — looks Latin but isn't.
    // The LLM occasionally slips these in for Latin-looking words. We want a
    // loud throw so the route retries instead of silently shipping.
    const dirty = {
      ...VALID_REPORT,
      candidates: [{ ...VALID_REPORT.candidates[0], name: 'Cadенce' }],
    }
    expect(() => parseReport(dirty)).toThrow(/non-ASCII|homoglyph/)
  })

  it('throws on emoji in candidate names', () => {
    const dirty = {
      ...VALID_REPORT,
      candidates: [{ ...VALID_REPORT.candidates[0], name: 'Rocket🚀' }],
    }
    expect(() => parseReport(dirty)).toThrow(/non-ASCII|homoglyph/)
  })

  it('throws when a topPick name does not match any candidate (P1 #5)', () => {
    const dirty = {
      ...VALID_REPORT,
      topPicks: [{ name: 'NotInCandidates', reasoning: 'r', nextSteps: 's' }],
    }
    expect(() => parseReport(dirty)).toThrow(/does not match any candidate/)
  })

  it('auto-prepends "Domain unavailable" prefix when LLM omits it on an unusable candidate (P0 #4)', () => {
    const dirty = {
      ...VALID_REPORT,
      candidates: [
        VALID_REPORT.candidates[0],
        {
          name: 'Doomed',
          style: 'invented' as const,
          rationale: 'Catchy and short.',
          trademarkRisk: 'low' as const,
          trademarkNotes: 'No conflicts.',
          domains: {
            tlds: { com: 'taken', io: 'likely taken', co: 'likely taken' },
            alternates: ['getdoomed.com'],
          },
        },
      ],
    }
    const result = parseReport(dirty)
    expect(result.candidates[1].rationale).toMatch(
      /^Domain unavailable — naming inspiration only\./
    )
    expect(result.candidates[1].rationale).toContain('Catchy and short')
  })

  it('auto-fixes ranking by moving unusable candidates to the bottom (P0 #4)', () => {
    const unusable = {
      name: 'Doomed',
      style: 'invented' as const,
      rationale: 'Domain unavailable — naming inspiration only. Catchy and short.',
      trademarkRisk: 'low' as const,
      trademarkNotes: 'No conflicts.',
      domains: {
        tlds: { com: 'taken', io: 'likely taken', co: 'likely taken' },
        alternates: ['getdoomed.com'],
      },
    }
    const dirty = {
      ...VALID_REPORT,
      // LLM put unusable at position 0; usable TestBrand at position 1
      candidates: [unusable, VALID_REPORT.candidates[0]],
      topPicks: [{ name: 'TestBrand', reasoning: 'r', nextSteps: 's' }],
    }
    const result = parseReport(dirty)
    expect(result.candidates.map((c) => c.name)).toEqual(['TestBrand', 'Doomed'])
  })

  it('auto-removes unusable candidates from topPicks (P0 #4)', () => {
    const unusable = {
      name: 'Doomed',
      style: 'invented' as const,
      rationale: 'Domain unavailable — naming inspiration only. Catchy and short.',
      trademarkRisk: 'low' as const,
      trademarkNotes: 'No conflicts.',
      domains: {
        tlds: { com: 'taken', io: 'likely taken', co: 'likely taken' },
        alternates: ['getdoomed.com'],
      },
    }
    const dirty = {
      ...VALID_REPORT,
      candidates: [VALID_REPORT.candidates[0], unusable],
      topPicks: [
        { name: 'Doomed', reasoning: 'r1', nextSteps: 's1' },
        { name: 'TestBrand', reasoning: 'r2', nextSteps: 's2' },
      ],
    }
    const result = parseReport(dirty)
    expect(result.topPicks.map((p) => p.name)).toEqual(['TestBrand'])
  })

  it('accepts a properly ranked + prefixed unusable candidate at the bottom', () => {
    const unusable = {
      name: 'Doomed',
      style: 'invented' as const,
      rationale: 'Domain unavailable — naming inspiration only. Catchy and short.',
      trademarkRisk: 'low' as const,
      trademarkNotes: 'No conflicts.',
      domains: {
        tlds: { com: 'taken', io: 'likely taken', co: 'likely taken' },
        alternates: ['getdoomed.com'],
      },
    }
    const clean = {
      ...VALID_REPORT,
      candidates: [VALID_REPORT.candidates[0], unusable],
      topPicks: [{ name: 'TestBrand', reasoning: 'r', nextSteps: 's' }],
    }
    expect(parseReport(clean).candidates).toHaveLength(2)
  })

  it('accepts legitimate Latin diacritics (ç, é, ñ, ü, ø)', () => {
    // The accuracy audit (2026-04-24) caught the previous strict regex 502'ing
    // on Provençal — French/Spanish/Italian brand names are valid.
    for (const name of ['Provençal', 'Crème', 'Mañana', 'Müller', 'Bjørk']) {
      const clean = {
        ...VALID_REPORT,
        candidates: [{ ...VALID_REPORT.candidates[0], name }],
        topPicks: [{ ...VALID_REPORT.topPicks[0], name }],
      }
      expect(parseReport(clean).candidates[0].name).toBe(name)
    }
  })

  it('allows plain ASCII names to pass through unchanged', () => {
    const clean = {
      ...VALID_REPORT,
      candidates: [{ ...VALID_REPORT.candidates[0], name: 'Cadence' }],
      topPicks: [{ ...VALID_REPORT.topPicks[0], name: 'Cadence' }],
    }
    expect(parseReport(clean).candidates[0].name).toBe('Cadence')
  })

  it('throws when a topPick is malformed', () => {
    const dirty = {
      ...VALID_REPORT,
      topPicks: [{ name: 123, reasoning: 'x', nextSteps: 'y' }],
    }
    expect(() => parseReport(dirty)).toThrow(/topPicks\[0\]\.name/)
  })

  it('strips leading dots from TLD keys', () => {
    const dirty = {
      ...VALID_REPORT,
      candidates: [
        {
          ...VALID_REPORT.candidates[0],
          domains: { tlds: { '.com': 'available', '.io': 'taken' }, alternates: [] },
        },
      ],
    }
    const tlds = parseReport(dirty).candidates[0].domains.tlds
    expect(Object.keys(tlds)).toEqual(['com', 'io'])
  })
})

describe('parseProposals', () => {
  it('parses a valid JSON array', () => {
    const result = parseProposals(VALID_PROPOSALS)
    expect(result).toHaveLength(8)
    expect(result[0].name).toBe('Brand0')
    expect(result[0].style).toBe('invented')
  })
  it('throws when fewer than 5 candidates returned', () => {
    const tooFew = VALID_PROPOSALS.slice(0, 3)
    expect(() => parseProposals(tooFew)).toThrow('Too few candidates: 3')
  })

  it('throws when no array found', () => {
    expect(() => parseProposals('not an array at all')).toThrow('Response is not an array')
  })
})

describe('generateCandidates', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
  })

  it('returns proposals and filteredCandidates on success', async () => {
    mockCreate.mockResolvedValue(
      makeToolResponse('record_candidates', {
        candidates: MOCK_PROPOSALS,
        filteredCandidates: MOCK_FILTERED_CANDIDATES,
      })
    )

    const result = await generateCandidates({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'company',
    })

    expect(result.proposals).toHaveLength(8)
    expect(result.filteredCandidates).toHaveLength(3)
    expect(result.proposals[0].name).toBe('Brand0')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6' }))
  })

  it('throws when model returns fewer than 5 candidates', async () => {
    const tooFew = MOCK_PROPOSALS.slice(0, 3)
    mockCreate.mockResolvedValue(
      makeToolResponse('record_candidates', {
        candidates: tooFew,
        filteredCandidates: MOCK_FILTERED_CANDIDATES,
      })
    )

    await expect(
      generateCandidates({
        description: 'x',
        personality: 'y',
        constraints: '',
        geography: 'z',
        nameType: 'company',
      })
    ).rejects.toThrow('Too few candidates')
  })

  it('throws when model does not call the expected tool', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'no tools' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    await expect(
      generateCandidates({
        description: 'x',
        personality: 'y',
        constraints: '',
        geography: 'z',
        nameType: 'company',
      })
    ).rejects.toThrow('Model did not call the')
  })

  it('retries once on RateLimitError then succeeds', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require('@anthropic-ai/sdk').default
    const rateLimit = new Anthropic.RateLimitError('throttled')
    // Use a tiny retry-after so the test doesn't sit on the default 30s delay.
    rateLimit.headers = { 'retry-after': '0.001' }

    mockCreate.mockRejectedValueOnce(rateLimit).mockResolvedValueOnce(
      makeToolResponse('record_candidates', {
        candidates: MOCK_PROPOSALS,
        filteredCandidates: MOCK_FILTERED_CANDIDATES,
      })
    )

    const result = await generateCandidates({
      description: 'x',
      personality: 'y',
      constraints: '',
      geography: 'z',
      nameType: 'company',
    })

    expect(result.proposals).toHaveLength(8)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('retries once with ASCII caveat when the first attempt produces a homoglyph', async () => {
    // First attempt: LLM slips in "Cadенce" (Cyrillic е н) — validator throws
    // Second attempt: LLM produces clean ASCII names
    const homoglyphProposals = [
      { name: 'Cadенce', style: 'invented', rationale: 'Homoglyph slip.' },
      ...MOCK_PROPOSALS.slice(1),
    ]
    mockCreate
      .mockResolvedValueOnce(
        makeToolResponse('record_candidates', {
          candidates: homoglyphProposals,
          filteredCandidates: MOCK_FILTERED_CANDIDATES,
        })
      )
      .mockResolvedValueOnce(
        makeToolResponse('record_candidates', {
          candidates: MOCK_PROPOSALS,
          filteredCandidates: MOCK_FILTERED_CANDIDATES,
        })
      )

    const result = await generateCandidates({
      description: 'x',
      personality: 'y',
      constraints: '',
      geography: 'z',
      nameType: 'company',
    })

    expect(result.proposals).toHaveLength(8)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    // Confirm the retry carried the ASCII caveat in the user message
    const retryCall = mockCreate.mock.calls[1][0]
    const retryUserMsg = retryCall.messages[0].content as string
    expect(retryUserMsg).toContain('ASCII Latin characters')
    expect(retryUserMsg).toContain('Cyrillic')
  })

  it('passes the nameType through to the LLM user message', async () => {
    expect.assertions(1)
    mockCreate.mockResolvedValue(
      makeToolResponse('record_candidates', { candidates: MOCK_PROPOSALS })
    )

    await generateCandidates({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'product',
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const userMsg = callArgs.messages[0].content as string
    expect(userMsg).toContain('Name type: product within an existing company')
  })

  it('renders nameType "company" as company entity in the user message', async () => {
    expect.assertions(1)
    mockCreate.mockResolvedValue(
      makeToolResponse('record_candidates', { candidates: MOCK_PROPOSALS })
    )

    await generateCandidates({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'company',
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const userMsg = callArgs.messages[0].content as string
    expect(userMsg).toContain('Name type: company entity')
  })

  it('throws if both attempts produce homoglyph-prone names', async () => {
    // Both attempts slip homoglyphs — accept the failure
    const homoglyphProposals = [
      { name: 'Cadенce', style: 'invented', rationale: 'Still cyrillic.' },
      ...MOCK_PROPOSALS.slice(1),
    ]
    mockCreate
      .mockResolvedValueOnce(
        makeToolResponse('record_candidates', { candidates: homoglyphProposals })
      )
      .mockResolvedValueOnce(
        makeToolResponse('record_candidates', { candidates: homoglyphProposals })
      )

    await expect(
      generateCandidates({
        description: 'x',
        personality: 'y',
        constraints: '',
        geography: 'z',
        nameType: 'company',
      })
    ).rejects.toThrow(/homoglyph-prone/)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})

import type { TrademarkCheckResult } from '@/lib/signa'
import type { DomainAvailability } from '@/lib/types'

const MOCK_TRADEMARK: TrademarkCheckResult = {
  candidateName: 'Brand0',
  risk: 'low',
  notes: 'No conflicts found.',
  sources: ['Signa (USPTO + EUIPO)'],
  conflicts: [],
}

const MOCK_DOMAINS: DomainAvailability = {
  tlds: { com: 'available', io: 'uncertain', co: 'likely taken' },
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
    mockCreate.mockResolvedValue(makeToolResponse('record_report', MOCK_FULL_REPORT))

    const result = await synthesiseReport(
      {
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
        nameType: 'company',
      },
      VERIFIED
    )

    expect(result.candidates).toHaveLength(8)
    expect(result.topPicks).toHaveLength(3)
    expect(result.summary).toBe('A SaaS tool for developers.')
  })

  it('passes verified trademark and domain data in the user message', async () => {
    mockCreate.mockResolvedValue(makeToolResponse('record_report', MOCK_FULL_REPORT))

    await synthesiseReport(
      {
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
        nameType: 'company',
      },
      VERIFIED
    )

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('Brand0')
    expect(callArgs.messages[0].content).toContain('Conflicts: none found')
    expect(callArgs.messages[0].content).toContain('TLD com: available')
  })

  it('throws when model does not call the expected tool', async () => {
    mockCreate.mockResolvedValue({ content: [], usage: { input_tokens: 100, output_tokens: 50 } })

    await expect(
      synthesiseReport(
        {
          description: 'x',
          personality: 'y',
          constraints: '',
          geography: 'z',
          nameType: 'company',
        },
        VERIFIED
      )
    ).rejects.toThrow('Model did not call the')
  })
})

jest.mock('@/lib/signa', () => ({
  checkAllTrademarks: jest.fn(),
  TRADEMARK_UNAVAILABLE_NOTES: 'Trademark search unavailable.',
}))
jest.mock('@/lib/dns', () => ({
  checkAllDomains: jest.fn(),
}))
jest.mock('@/lib/euipo', () => ({
  checkAllEuipoTrademarks: jest.fn(),
  shouldQueryEuipo: jest.fn().mockReturnValue(true),
}))
jest.mock('@/lib/flags', () => ({
  isFlagEnabled: jest.fn(),
}))

import { checkAllTrademarks } from '@/lib/signa'
import type { TrademarkCheckResult } from '@/lib/signa'
import { checkAllDomains } from '@/lib/dns'
import { checkAllEuipoTrademarks, shouldQueryEuipo } from '@/lib/euipo'
import { isFlagEnabled } from '@/lib/flags'
import { generateReport, mergeTrademarkResults } from '@/lib/anthropic'

const mkTrademark = (
  name: string,
  risk: TrademarkCheckResult['risk'],
  source = 'Signa'
): TrademarkCheckResult => ({
  candidateName: name,
  risk,
  notes: `${source}: ${risk}`,
  sources: [source],
  conflicts: [],
})

// Helper for tests that exercise generateReport — the orchestrator fires
// generateCandidates + inferNiceClass in parallel, then synthesiseReport,
// so each full run costs 3 LLM responses.
function mockGenerateReportResponses(proposals: unknown, niceClass: number, report: unknown) {
  mockCreate.mockResolvedValueOnce(makeToolResponse('record_candidates', { candidates: proposals }))
  mockCreate.mockResolvedValueOnce(makeTextResponse(String(niceClass)))
  mockCreate.mockResolvedValueOnce(makeToolResponse('record_report', report))
}

describe('generateReport orchestrator', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
    ;(checkAllTrademarks as jest.Mock).mockResolvedValue(new Map())
    ;(checkAllDomains as jest.Mock).mockResolvedValue(new Map())
    ;(checkAllEuipoTrademarks as jest.Mock).mockResolvedValue(new Map())
    ;(isFlagEnabled as jest.Mock).mockResolvedValue(false)
    ;(shouldQueryEuipo as jest.Mock).mockReturnValue(true)
  })

  it('calls generateCandidates + inferNiceClass then verification then synthesiseReport', async () => {
    mockGenerateReportResponses(MOCK_PROPOSALS, 42, MOCK_FULL_REPORT)

    const result = await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'company',
    })

    expect(checkAllTrademarks).toHaveBeenCalledWith(MOCK_PROPOSALS, 42, 'Global')
    expect(checkAllDomains).toHaveBeenCalledWith(MOCK_PROPOSALS, ['com', 'io', 'co'])
    expect(mockCreate).toHaveBeenCalledTimes(3)
    expect(result.candidates).toHaveLength(8)
  })

  it('passes the inferred Nice class to the trademark check', async () => {
    mockGenerateReportResponses(MOCK_PROPOSALS, 30, MOCK_FULL_REPORT)

    await generateReport({
      description: 'A coffee shop in Brooklyn',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
      nameType: 'company',
    })

    expect(checkAllTrademarks).toHaveBeenCalledWith(MOCK_PROPOSALS, 30, 'US-first')
  })

  it('falls back to Nice class 42 when inference returns non-numeric output', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse('record_candidates', { candidates: MOCK_PROPOSALS })
    )
    mockCreate.mockResolvedValueOnce(makeTextResponse('I am not sure what class this is'))
    mockCreate.mockResolvedValueOnce(makeToolResponse('record_report', MOCK_FULL_REPORT))

    await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'company',
    })

    expect(checkAllTrademarks).toHaveBeenCalledWith(MOCK_PROPOSALS, 42, 'Global')
  })

  it('throws when both Signa and DNS fail', async () => {
    ;(checkAllTrademarks as jest.Mock).mockRejectedValue(new Error('Signa down'))
    ;(checkAllDomains as jest.Mock).mockRejectedValue(new Error('DNS down'))

    mockCreate.mockResolvedValueOnce(
      makeToolResponse('record_candidates', { candidates: MOCK_PROPOSALS })
    )
    mockCreate.mockResolvedValueOnce(makeTextResponse('42'))

    await expect(
      generateReport({
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
        nameType: 'company',
      })
    ).rejects.toThrow('Both trademark and domain verification failed')
  })

  it('skips EUIPO when the LD flag is off', async () => {
    ;(isFlagEnabled as jest.Mock).mockResolvedValue(false)
    mockGenerateReportResponses(MOCK_PROPOSALS, 42, MOCK_FULL_REPORT)

    await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
      nameType: 'company',
    })

    expect(checkAllEuipoTrademarks).not.toHaveBeenCalled()
  })

  it('skips EUIPO when the flag is on but geography does not include the EU', async () => {
    ;(isFlagEnabled as jest.Mock).mockResolvedValue(true)
    ;(shouldQueryEuipo as jest.Mock).mockReturnValue(false)
    mockGenerateReportResponses(MOCK_PROPOSALS, 42, MOCK_FULL_REPORT)

    await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'US-first',
      nameType: 'company',
    })

    expect(checkAllEuipoTrademarks).not.toHaveBeenCalled()
  })

  it('queries Signa and EUIPO in parallel when the LD flag is on and geography includes EU', async () => {
    ;(isFlagEnabled as jest.Mock).mockResolvedValue(true)
    ;(checkAllTrademarks as jest.Mock).mockResolvedValue(
      new Map([['Brand0', mkTrademark('Brand0', 'low', 'Signa')]])
    )
    ;(checkAllEuipoTrademarks as jest.Mock).mockResolvedValue(
      new Map([['Brand0', mkTrademark('Brand0', 'low', 'EUIPO direct')]])
    )
    mockGenerateReportResponses(MOCK_PROPOSALS, 42, MOCK_FULL_REPORT)

    await generateReport(
      {
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
        nameType: 'company',
      },
      { requestId: 'req-flagon' }
    )

    expect(checkAllTrademarks).toHaveBeenCalled()
    expect(checkAllEuipoTrademarks).toHaveBeenCalled()
    expect(isFlagEnabled).toHaveBeenCalledWith(
      'euipo-direct-cross-check',
      expect.objectContaining({ key: 'req-flagon' }),
      false
    )
  })
})

describe('extractCitedMarks', () => {
  it('extracts ALL-CAPS mark names from trademark notes', () => {
    const notes =
      'Multiple live conflicts exist: CADENCE (USPTO, live, Class 42, reg #3474135, owner: Cadence Design Systems, Inc.), QUORUM (EUIPO, live, Class 35/42, reg #4785725).'
    const cited = extractCitedMarks(notes)
    expect(cited).toContain('CADENCE')
    expect(cited).toContain('QUORUM')
  })

  it('filters out registry/structural stopwords', () => {
    const notes = 'Multiple live conflicts in USPTO and EUIPO. Class 42 conflicts REGISTERED.'
    const cited = extractCitedMarks(notes)
    // USPTO, EUIPO, CLASS, REGISTERED are stopwords — should be filtered
    expect(cited).toEqual([])
  })

  it('handles multi-word mark names', () => {
    const notes = "STACIE'S SPACES (USPTO, live) is a narrow conflict."
    const cited = extractCitedMarks(notes)
    // The apostrophe-separated token should be captured
    expect(cited.some((m) => m.includes('STACIE'))).toBe(true)
  })

  it('returns empty array for notes with no mark citations', () => {
    expect(extractCitedMarks('No conflicts found in any registry.')).toEqual([])
    expect(extractCitedMarks('No live conflicts found in Signa + EUIPO.')).toEqual([])
  })

  it('deduplicates repeated mark references', () => {
    const notes = 'CADENCE (USPTO) and CADENCE (EUIPO) are both live.'
    const cited = extractCitedMarks(notes)
    expect(cited.filter((m) => m === 'CADENCE')).toHaveLength(1)
  })
})

describe('validateGroundedMarks', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    // Use the imported logger mock so we can assert on warn calls
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const logger = require('@/lib/logger').default
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  function makeReport(notes: string): ReportData {
    return {
      summary: 'x',
      candidates: [
        {
          name: 'Acmely',
          style: 'invented',
          rationale: 'r',
          trademarkRisk: 'low',
          trademarkNotes: notes,
          domains: { tlds: { com: 'available' }, alternates: [] },
        },
      ],
      topPicks: [{ name: 'Acmely', reasoning: 'r', nextSteps: 's' }],
      recommendation: 'x',
    }
  }

  function makeVerified(conflictMarks: string[], owners: string[] = []) {
    return [
      {
        name: 'Acmely',
        trademark: {
          conflicts: conflictMarks.map((m, i) => ({
            markText: m,
            ownerName: owners[i],
          })),
        },
      },
    ]
  }

  it('passes silently when every cited mark matches input conflicts', () => {
    const report = makeReport('Live conflicts: CADENCE (USPTO), QUORUM (EUIPO).')
    const verified = makeVerified(['CADENCE', 'QUORUM'])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(0)
  })

  it('warns when a cited mark does not appear in input conflicts (hallucination)', () => {
    const report = makeReport('Live conflicts: HALLUCINATED (USPTO) blocks filing.')
    const verified = makeVerified(['REAL-MARK'])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(1)
    expect(ungroundedCalls[0][0].cited).toBe('HALLUCINATED')
  })

  it('warns on ANY citation when the input conflict list is empty', () => {
    const report = makeReport('Live conflicts: INVENTED (USPTO).')
    const verified = makeVerified([])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls.length).toBeGreaterThan(0)
  })

  it('accepts partial substring matches (cited mark is shorter than input)', () => {
    const report = makeReport('CADENCE conflicts with the candidate.')
    const verified = makeVerified(['CADENCE DESIGN SYSTEMS, INC.'])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(0)
  })

  it("does not flag the candidate's own name as an ungrounded citation", () => {
    // LLM commonly writes "ACMELY has no conflicts..." — echoing the candidate
    // name is not a hallucination.
    const report = makeReport('ACMELY has zero trademark conflicts in the queried offices.')
    const verified = makeVerified([])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(0)
  })

  it('does not flag owner names that appear in input conflicts', () => {
    const report = makeReport(
      'Conflicts cited: CADENCE DESIGN SYSTEMS (reg #3474135) — narrow industry scope.'
    )
    const verified = makeVerified(['CADENCE'], ['Cadence Design Systems, Inc.'])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(0)
  })

  it('does not flag registration numbers as ungrounded citations', () => {
    const report = makeReport('Conflict registered as W01053769 in 2018.')
    const verified = makeVerified([])
    validateGroundedMarks(report, verified)
    const ungroundedCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'ungrounded_citation')
    expect(ungroundedCalls).toHaveLength(0)
  })
})

describe('validateStyleDistribution', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const logger = require('@/lib/logger').default
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  function cand(style: string) {
    return { style }
  }

  it('passes silently when the mix matches the personality', () => {
    // Premium/refined prefers invented+compound; 5/8 match
    const candidates = [
      cand('invented'),
      cand('invented'),
      cand('compound'),
      cand('compound'),
      cand('compound'),
      cand('descriptive'),
      cand('acronym'),
      cand('metaphorical'),
    ]
    validateStyleDistribution('Premium / refined', candidates)
    expect(warnSpy.mock.calls.filter((c) => c[0]?.event === 'style_distribution_off')).toHaveLength(
      0
    )
  })

  it('warns when the LLM ignores the personality (below 25% floor)', () => {
    // Premium/refined prefers invented+compound, but 0/8 match
    const candidates = [
      cand('descriptive'),
      cand('descriptive'),
      cand('metaphorical'),
      cand('metaphorical'),
      cand('acronym'),
      cand('acronym'),
      cand('metaphorical'),
      cand('descriptive'),
    ]
    validateStyleDistribution('Premium / refined', candidates)
    const offCalls = warnSpy.mock.calls.filter((c) => c[0]?.event === 'style_distribution_off')
    expect(offCalls).toHaveLength(1)
    expect(offCalls[0][0].ratio).toBe(0)
  })

  it('skips validation for unknown personalities (no preferred-style rule)', () => {
    const candidates = [cand('descriptive'), cand('acronym')]
    validateStyleDistribution('Eclectic / undefined', candidates)
    expect(warnSpy.mock.calls.filter((c) => c[0]?.event === 'style_distribution_off')).toHaveLength(
      0
    )
  })

  it('does not warn when the personality-style alignment is solid', () => {
    // Bold/contrarian prefers invented+metaphorical; 6/8 match
    const candidates = [
      cand('invented'),
      cand('invented'),
      cand('metaphorical'),
      cand('metaphorical'),
      cand('metaphorical'),
      cand('invented'),
      cand('compound'),
      cand('descriptive'),
    ]
    validateStyleDistribution('Bold / contrarian', candidates)
    expect(warnSpy.mock.calls.filter((c) => c[0]?.event === 'style_distribution_off')).toHaveLength(
      0
    )
  })
})

describe('mergeTrademarkResults', () => {
  it('reports no live conflicts found when both sources return low', () => {
    const merged = mergeTrademarkResults(
      mkTrademark('Acme', 'low', 'Signa'),
      mkTrademark('Acme', 'low', 'EUIPO direct')
    )

    expect(merged.risk).toBe('low')
    expect(merged.notes).toContain('No live conflicts found')
    expect(merged.sources).toEqual(['Signa', 'EUIPO direct'])
  })

  it('takes the worst risk when sources disagree and flags the disagreement', () => {
    const merged = mergeTrademarkResults(
      mkTrademark('Acme', 'low', 'Signa'),
      mkTrademark('Acme', 'high', 'EUIPO direct')
    )

    expect(merged.risk).toBe('high')
    expect(merged.notes).toContain('disagree')
  })

  it('escalates to high when either source flags high', () => {
    const merged = mergeTrademarkResults(
      mkTrademark('Acme', 'high', 'Signa'),
      mkTrademark('Acme', 'low', 'EUIPO direct')
    )

    expect(merged.risk).toBe('high')
  })

  it('uses the concrete source when one is uncertain', () => {
    const uncertain: TrademarkCheckResult = {
      candidateName: 'Acme',
      risk: 'uncertain',
      notes: 'unavailable',
      sources: [],
      conflicts: [],
    }
    const merged = mergeTrademarkResults(uncertain, mkTrademark('Acme', 'moderate', 'EUIPO direct'))

    expect(merged.risk).toBe('moderate')
    expect(merged.sources).toEqual(['EUIPO direct'])
    // Should NOT mark this as a disagreement — uncertain isn't a real signal
    expect(merged.notes).not.toContain('disagree')
    // Surfaces partial-coverage so user knows risk reflects EUIPO only (P1 #6 from accuracy audit)
    expect(merged.notes).toContain('Signa check unavailable')
  })

  it('flags EUIPO unavailable when only Signa returned a concrete result', () => {
    const uncertain: TrademarkCheckResult = {
      candidateName: 'Acme',
      risk: 'uncertain',
      notes: 'unavailable',
      sources: [],
      conflicts: [],
    }
    const merged = mergeTrademarkResults(mkTrademark('Acme', 'low', 'Signa'), uncertain)

    expect(merged.risk).toBe('low')
    expect(merged.sources).toEqual(['Signa'])
    expect(merged.notes).toContain('EUIPO check unavailable')
  })

  it('returns uncertain when both sources are uncertain', () => {
    const uncertain = (n: string): TrademarkCheckResult => ({
      candidateName: n,
      risk: 'uncertain',
      notes: 'unavailable',
      sources: [],
      conflicts: [],
    })

    const merged = mergeTrademarkResults(uncertain('Acme'), uncertain('Acme'))

    expect(merged.risk).toBe('uncertain')
    expect(merged.sources).toEqual([])
    expect(merged.notes).toContain('both unavailable')
  })
})
