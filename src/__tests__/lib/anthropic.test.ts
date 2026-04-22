import { parseReport, parseProposals } from '@/lib/anthropic'
import type { ReportData, CandidateProposal } from '@/lib/types'

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

const VALID_PROPOSALS: CandidateProposal[] = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Strategic rationale here.',
}))

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
