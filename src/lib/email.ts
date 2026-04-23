import { Resend } from 'resend'
import type { ReportData } from './types'
import logger from './logger'

// Sends the user a permanent copy of their paid report. The 24h KV TTL is a
// browser-session convenience; this email is the canonical artifact the user
// keeps. Returns silently when RESEND_API_KEY is unset so dev and pre-launch
// deploys don't need a Resend account.

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'Namewright <reports@namewright.co>'
const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'support@namewright.co'

let _client: Resend | null = null
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!_client) _client = new Resend(key)
  return _client
}

interface SendReportEmailOpts {
  to: string
  reportId: string
  report: ReportData
}

interface SendReportEmailResult {
  ok: boolean
  /** Resend message id when sent; undefined when skipped or failed */
  messageId?: string
  /** Reason the email was not sent (e.g. "no api key", "send failed: ...") */
  reason?: string
}

export async function sendReportEmail(opts: SendReportEmailOpts): Promise<SendReportEmailResult> {
  const client = getClient()
  if (!client) {
    return { ok: false, reason: 'RESEND_API_KEY not set' }
  }

  const { subject, html, text } = renderReportEmail(opts.report)

  try {
    const result = await client.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    })

    if (result.error) {
      logger.warn({ reportId: opts.reportId, err: result.error.message }, 'Resend rejected email')
      return { ok: false, reason: `send failed: ${result.error.message}` }
    }

    logger.info({ reportId: opts.reportId, messageId: result.data?.id }, 'report email sent')
    return { ok: true, messageId: result.data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ reportId: opts.reportId, err: message }, 'report email send threw')
    return { ok: false, reason: `send threw: ${message}` }
  }
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Renders the report into both HTML (for clients that support it) and plain
// text (fallback for screen-readers, accessibility-mode mail clients, and
// spam-filter heuristics). Inline CSS only — most email clients strip <style>.
export function renderReportEmail(report: ReportData): RenderedEmail {
  const topPick = report.topPicks[0]?.name ?? 'your name candidates'
  const subject = `Your Namewright report — ${topPick}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fcf8f0;font-family:Lato,Helvetica,Arial,sans-serif;color:#1a1108;font-weight:300;line-height:1.6;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
      <div style="width:6px;height:6px;border-radius:50%;background:#b87333;"></div>
      <span style="font-family:Georgia,'Source Serif 4',serif;font-style:italic;font-weight:600;font-size:14px;letter-spacing:-0.01em;">Namewright</span>
    </div>

    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 12px;">Brief</p>
    <p style="font-family:Georgia,'Source Serif 4',serif;font-size:22px;line-height:1.4;margin:0 0 32px;color:#1a1108;">${escapeHtml(report.summary)}</p>

    ${renderTopPicksHtml(report.topPicks)}

    ${
      report.recommendation
        ? `<div style="border-top:1px solid #e5dccd;padding-top:24px;margin-bottom:32px;">
        <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 12px;">Recommendation</p>
        <p style="font-family:Georgia,'Source Serif 4',serif;font-size:18px;line-height:1.5;margin:0;color:#1a1108;">${escapeHtml(report.recommendation)}</p>
      </div>`
        : ''
    }

    ${renderAllCandidatesHtml(report.candidates)}

    <div style="border-top:1px solid #e5dccd;padding-top:24px;margin-top:32px;">
      <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 12px;">Verify before you commit</p>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;">
        <li><a href="https://tmsearch.uspto.gov/search/search-information" style="color:#b87333;">USPTO TESS trademark search (US)</a></li>
        <li><a href="https://www.tmdn.org/tmview/" style="color:#b87333;">EUIPO TMview trademark search (EU)</a></li>
        <li><a href="https://search.ipaustralia.gov.au/trademarks/search/quick" style="color:#b87333;">IP Australia trademark search</a></li>
        <li><a href="https://www.whois.com/whois/" style="color:#b87333;">WHOIS domain lookup</a></li>
      </ul>
    </div>

    <p style="font-size:13px;color:#5c4a36;margin:32px 0 0;line-height:1.6;">
      <strong style="color:#1a1108;">Not legal advice.</strong> AI-assisted research based on real registry data and DNS signals. Verify with a qualified IP attorney before filing.
    </p>

    <p style="font-size:12px;color:#9c8a76;margin:24px 0 0;line-height:1.6;">
      This is your permanent copy of your Namewright report. Reply to this email if you have questions about anything in it.
    </p>
  </div>
</body>
</html>`

  const text = renderReportEmailText(report)
  return { subject, html, text }
}

function renderTopPicksHtml(topPicks: ReportData['topPicks']): string {
  if (topPicks.length === 0) return ''
  const items = topPicks
    .map(
      (
        pick,
        i
      ) => `<div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #f0e7d6;">
      <div style="display:flex;gap:16px;align-items:baseline;">
        <span style="font-family:'DM Mono',Menlo,monospace;font-size:12px;color:#b87333;font-weight:700;">${String(i + 1).padStart(2, '0')}</span>
        <h3 style="font-family:Georgia,'Source Serif 4',serif;font-weight:700;font-size:22px;margin:0;color:#1a1108;">${escapeHtml(pick.name)}</h3>
      </div>
      <p style="font-size:14px;color:#5c4a36;margin:8px 0 12px;line-height:1.7;">${escapeHtml(pick.reasoning)}</p>
      <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 6px;">Next steps</p>
      <p style="font-size:14px;color:#5c4a36;margin:0;line-height:1.7;">${escapeHtml(pick.nextSteps)}</p>
    </div>`
    )
    .join('')

  return `<p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 16px;">Top picks</p>${items}`
}

function renderAllCandidatesHtml(candidates: ReportData['candidates']): string {
  const rows = candidates
    .map(
      (c, i) => `<tr>
      <td style="padding:8px 12px 8px 0;font-family:'DM Mono',Menlo,monospace;font-size:11px;color:#9c8a76;vertical-align:top;">${String(i + 1).padStart(2, '0')}</td>
      <td style="padding:8px 12px 8px 0;font-family:Georgia,'Source Serif 4',serif;font-size:16px;color:#1a1108;vertical-align:top;">${escapeHtml(c.name)}</td>
      <td style="padding:8px 12px 8px 0;font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${riskColorHex(c.trademarkRisk)};vertical-align:top;">${escapeHtml(c.trademarkRisk)} risk</td>
    </tr>`
    )
    .join('')

  return `<div style="margin-bottom:32px;">
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 12px;">All ${candidates.length} candidates — ranked</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5dccd;">
      ${rows}
    </table>
  </div>`
}

function riskColorHex(risk: string): string {
  if (risk === 'low') return '#3d6b3d'
  if (risk === 'moderate') return '#8a6a1f'
  if (risk === 'high') return '#a83232'
  return '#9c8a76'
}

function renderReportEmailText(report: ReportData): string {
  const lines: string[] = []
  lines.push('NAMEWRIGHT REPORT')
  lines.push('='.repeat(60))
  lines.push('')
  lines.push('BRIEF')
  lines.push(report.summary)
  lines.push('')

  if (report.topPicks.length > 0) {
    lines.push('TOP PICKS')
    lines.push('-'.repeat(60))
    report.topPicks.forEach((pick, i) => {
      lines.push(`${String(i + 1).padStart(2, '0')}  ${pick.name}`)
      lines.push(`    ${pick.reasoning}`)
      lines.push(`    Next steps: ${pick.nextSteps}`)
      lines.push('')
    })
  }

  if (report.recommendation) {
    lines.push('RECOMMENDATION')
    lines.push(report.recommendation)
    lines.push('')
  }

  lines.push(`ALL ${report.candidates.length} CANDIDATES — RANKED`)
  lines.push('-'.repeat(60))
  report.candidates.forEach((c, i) => {
    lines.push(`${String(i + 1).padStart(2, '0')}  ${c.name}  [${c.trademarkRisk} risk]`)
  })
  lines.push('')

  lines.push('VERIFY BEFORE YOU COMMIT')
  lines.push('  - USPTO TESS:    https://tmsearch.uspto.gov/search/search-information')
  lines.push('  - EUIPO TMview:  https://www.tmdn.org/tmview/')
  lines.push('  - IP Australia:  https://search.ipaustralia.gov.au/trademarks/search/quick')
  lines.push('  - WHOIS lookup:  https://www.whois.com/whois/')
  lines.push('')
  lines.push('Not legal advice. AI-assisted research based on real registry')
  lines.push('data and DNS signals. Verify with a qualified IP attorney.')
  lines.push('')
  lines.push('This is your permanent copy. Reply to this email with questions.')
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Test-only helper: clears the cached client so tests can re-init with fresh env. */
export function _resetEmailClientForTesting(): void {
  if (process.env.NODE_ENV !== 'test') return
  _client = null
}
