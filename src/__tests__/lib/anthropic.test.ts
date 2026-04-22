import { parseReport } from '@/lib/anthropic'
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
