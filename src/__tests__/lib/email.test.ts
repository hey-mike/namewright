const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}))

import { sendReportEmail, renderReportEmail, _resetEmailClientForTesting } from '@/lib/email'
import type { ReportData } from '@/lib/types'

const ORIGINAL_ENV = { ...process.env }

const SAMPLE_REPORT: ReportData = {
  summary: 'A SaaS for async standups in distributed engineering teams.',
  candidates: [
    {
      name: 'Standwell',
      style: 'compound',
      rationale: 'Combines stand-up with well, suggesting healthy team rhythm.',
      trademarkRisk: 'low',
      trademarkNotes: 'No active conflicts in queried offices.',
      domains: { tlds: { com: 'available', io: 'available' }, alternates: [] },
    },
    {
      name: 'Dailync',
      style: 'invented',
      rationale: 'Daily + sync, a coined word with clear implication.',
      trademarkRisk: 'moderate',
      trademarkNotes: 'One similar mark in Class 42.',
      domains: { tlds: { com: 'taken', io: 'available' }, alternates: ['getdailync.com'] },
    },
  ],
  topPicks: [
    {
      name: 'Standwell',
      reasoning: 'Cleanest trademark, best domain availability, fits premium personality.',
      nextSteps: 'Register standwell.com today, file USPTO ITU within 60 days.',
    },
  ],
  recommendation: 'Pursue Standwell first; Dailync as a fallback.',
}

beforeEach(() => {
  mockSend.mockReset()
  _resetEmailClientForTesting()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('sendReportEmail', () => {
  it('returns ok=false when RESEND_API_KEY is unset and never calls Resend', async () => {
    delete process.env.RESEND_API_KEY

    const result = await sendReportEmail({
      to: 'maya@example.com',
      reportId: 'rpt-1',
      report: SAMPLE_REPORT,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('RESEND_API_KEY')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends via Resend with the rendered subject + html + text when key is set', async () => {
    process.env.RESEND_API_KEY = 're-test-key'
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null })

    const result = await sendReportEmail({
      to: 'maya@example.com',
      reportId: 'rpt-2',
      report: SAMPLE_REPORT,
    })

    expect(result.ok).toBe(true)
    expect(result.messageId).toBe('msg-123')
    expect(mockSend).toHaveBeenCalledTimes(1)
    const payload = mockSend.mock.calls[0][0]
    expect(payload.to).toBe('maya@example.com')
    expect(payload.subject).toContain('Standwell')
    expect(payload.html).toContain('Standwell')
    expect(payload.html).toContain('A SaaS for async standups')
    expect(payload.text).toContain('Standwell')
    expect(payload.text).toContain('TOP PICKS')
  })

  it('returns ok=false when Resend returns an error object', async () => {
    process.env.RESEND_API_KEY = 're-test-key'
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'invalid recipient' },
    })

    const result = await sendReportEmail({
      to: 'bogus',
      reportId: 'rpt-3',
      report: SAMPLE_REPORT,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('invalid recipient')
  })

  it('returns ok=false when the SDK throws', async () => {
    process.env.RESEND_API_KEY = 're-test-key'
    mockSend.mockRejectedValue(new Error('network down'))

    const result = await sendReportEmail({
      to: 'maya@example.com',
      reportId: 'rpt-4',
      report: SAMPLE_REPORT,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('network down')
  })
})

describe('renderReportEmail', () => {
  it('produces a subject mentioning the top pick', () => {
    const { subject } = renderReportEmail(SAMPLE_REPORT)
    expect(subject).toContain('Standwell')
  })

  it('escapes HTML entities in user-controlled fields', () => {
    const tainted: ReportData = {
      ...SAMPLE_REPORT,
      summary: 'A "tool" for <script>alert("xss")</script> teams',
    }
    const { html } = renderReportEmail(tainted)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;tool&quot;')
  })

  it('falls back gracefully when topPicks is empty', () => {
    const noTopPicks: ReportData = { ...SAMPLE_REPORT, topPicks: [] }
    const { subject, html } = renderReportEmail(noTopPicks)
    expect(subject).toContain('your name candidates')
    // Should not contain a "Top picks" heading when there are none
    expect(html).not.toContain('Top picks')
  })

  it('renders all candidates in the ranked table', () => {
    const { html, text } = renderReportEmail(SAMPLE_REPORT)
    expect(html).toContain('Standwell')
    expect(html).toContain('Dailync')
    expect(text).toContain('Standwell')
    expect(text).toContain('Dailync')
  })

  it('includes per-candidate rationale, trademark notes, and domains in HTML', () => {
    const { html } = renderReportEmail(SAMPLE_REPORT)
    expect(html).toContain('Combines stand-up with well')
    expect(html).toContain('One similar mark in Class 42')
    expect(html).toContain('.com')
    expect(html).toContain('.io')
    expect(html).toContain('getdailync.com')
  })

  it('includes per-candidate rationale, trademark notes, and domains in plain text', () => {
    const { text } = renderReportEmail(SAMPLE_REPORT)
    expect(text).toContain('Rationale: Combines stand-up with well')
    expect(text).toContain('Trademark notes: One similar mark in Class 42')
    expect(text).toContain('.com: available')
    expect(text).toContain('.io: available')
    expect(text).toContain('Alternates: getdailync.com')
  })

  it('omits the alternates block when a candidate has no alternates', () => {
    const { html, text } = renderReportEmail(SAMPLE_REPORT)
    // Standwell has no alternates — confirm we don't emit an empty header
    const standwellBlock = html.slice(html.indexOf('Standwell'), html.indexOf('Dailync'))
    expect(standwellBlock).not.toContain('Alternates')
    const standwellText = text.slice(text.indexOf('Standwell'), text.indexOf('Dailync'))
    expect(standwellText).not.toContain('Alternates:')
  })

  it('uses the new value-forward disclaimer wording', () => {
    const { html, text } = renderReportEmail(SAMPLE_REPORT)
    expect(html).toContain('research short-list, not a legal opinion')
    expect(text).toContain('research short-list, not a legal opinion')
    expect(html).not.toContain('Not legal advice.')
    expect(text).not.toContain('Not legal advice.')
  })
})
