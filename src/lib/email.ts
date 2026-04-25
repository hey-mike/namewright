import { Resend } from 'resend'
import type { ReportData } from './types'
import logger from './logger'

// Sends the user a permanent copy of their paid report. The 7d KV TTL is a
// browser-session convenience; this email is the canonical artifact the user
// keeps. Returns silently when RESEND_API_KEY is unset so dev and pre-launch
// deploys don't need a Resend account.

// Read at call time (not module load) — matches the stripe/anthropic lazy pattern
// so RESEND_FROM_ADDRESS / RESEND_REPLY_TO env vars are always current at send
// time and not baked as empty-string defaults during any module pre-loading phase.
function getFromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS ?? 'Namewright <reports@namewright.co>'
}
function getReplyTo(): string {
  return process.env.RESEND_REPLY_TO ?? 'support@namewright.co'
}

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

  try {
    const { subject, html, text } = renderReportEmail(opts.report)
    const result = await client.emails.send({
      from: getFromAddress(),
      to: opts.to,
      replyTo: getReplyTo(),
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
      <strong style="color:#1a1108;">A research short-list, not a legal opinion.</strong>
      This report cross-checks selected registry sources (USPTO + EUIPO via Signa, WIPO Madrid)
      against real domain availability (DNS + RDAP + WhoisJSON) and ranks candidates against
      unregisterability criteria. It is preliminary screening, not legal clearance — a name flagged
      as low-risk here may still conflict with marks not in our sources, and a name flagged high-risk
      may still be defensibly registrable. Take it to a trademark attorney for formal clearance;
      they&apos;ll work from this instead of starting cold, typically saving 1–2 billable hours
      ($300–600 at standard rates).
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
  const blocks = candidates.map((c, i) => renderCandidateDetailHtml(c, i)).join('')

  return `<div style="margin-bottom:32px;">
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9c8a76;margin:0 0 16px;">All ${candidates.length} candidates — ranked</p>
    ${blocks}
  </div>`
}

function renderCandidateDetailHtml(c: ReportData['candidates'][number], i: number): string {
  const domainRows = Object.entries(c.domains.tlds)
    .map(
      ([tld, status]) => `<tr>
        <td style="padding:4px 12px 4px 0;font-family:'DM Mono',Menlo,monospace;font-size:11px;color:#5c4a36;">.${escapeHtml(tld)}</td>
        <td style="padding:4px 0;font-family:'DM Mono',Menlo,monospace;font-size:11px;color:${domainColorHex(status)};">${escapeHtml(status)}</td>
      </tr>`
    )
    .join('')

  const alternates =
    c.domains.alternates.length > 0
      ? `<p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Alternates</p>
         <p style="font-size:13px;color:#5c4a36;margin:0;line-height:1.7;">${c.domains.alternates.map((a) => escapeHtml(a)).join(' · ')}</p>`
      : ''

  const signalMatrix = c.domains.tldSignals ? renderSignalMatrixHtml(c.domains.tldSignals) : ''

  return `<div style="margin-bottom:24px;padding:20px;border:1px solid #e5dccd;border-radius:6px;background:#fdfaf3;">
    <div style="display:flex;gap:12px;align-items:baseline;margin-bottom:8px;">
      <span style="font-family:'DM Mono',Menlo,monospace;font-size:11px;color:#9c8a76;">${String(i + 1).padStart(2, '0')}</span>
      <h4 style="font-family:Georgia,'Source Serif 4',serif;font-weight:700;font-size:20px;margin:0;color:#1a1108;">${escapeHtml(c.name)}</h4>
      <span style="margin-left:auto;font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${riskColorHex(c.trademarkRisk)};">${escapeHtml(c.trademarkRisk)} risk</span>
    </div>
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Style</p>
    <p style="font-size:13px;color:#5c4a36;margin:0;line-height:1.7;">${escapeHtml(c.style)}</p>
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Rationale</p>
    <p style="font-size:13px;color:#5c4a36;margin:0;line-height:1.7;">${escapeHtml(c.rationale)}</p>
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Trademark notes</p>
    <p style="font-size:13px;color:#5c4a36;margin:0;line-height:1.7;">${escapeHtml(c.trademarkNotes)}</p>
    <p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Domains</p>
    <table style="border-collapse:collapse;margin:0;">${domainRows}</table>
    ${signalMatrix}
    ${alternates}
  </div>`
}

function renderSignalMatrixHtml(
  tldSignals: NonNullable<ReportData['candidates'][number]['domains']['tldSignals']>
): string {
  const rows = Object.entries(tldSignals)
    .map(([tld, sig]) => {
      const d = dnsLabelEmail(sig.dns)
      const r = rdapLabelEmail(sig.rdap)
      const rg = registrarLabelEmail(sig.registrar)
      return `<tr>
        <td style="padding:3px 12px 3px 0;font-family:'DM Mono',Menlo,monospace;font-size:10px;color:#5c4a36;">.${escapeHtml(tld)}</td>
        <td style="padding:3px 12px 3px 0;font-family:'DM Mono',Menlo,monospace;font-size:10px;color:${d.color};">${escapeHtml(d.label)}</td>
        <td style="padding:3px 12px 3px 0;font-family:'DM Mono',Menlo,monospace;font-size:10px;color:${r.color};">${escapeHtml(r.label)}</td>
        <td style="padding:3px 0;font-family:'DM Mono',Menlo,monospace;font-size:10px;color:${rg.color};">${escapeHtml(rg.label)}</td>
      </tr>`
    })
    .join('')

  return `<p style="font-family:'DM Mono',Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9c8a76;margin:12px 0 4px;">Signal breakdown</p>
    <table style="border-collapse:collapse;margin:0 0 4px;">
      <thead><tr>
        <th style="padding:0 12px 4px 0;font-family:'DM Mono',Menlo,monospace;font-size:9px;color:#9c8a76;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;text-align:left;"></th>
        <th style="padding:0 12px 4px 0;font-family:'DM Mono',Menlo,monospace;font-size:9px;color:#9c8a76;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;text-align:left;">DNS</th>
        <th style="padding:0 12px 4px 0;font-family:'DM Mono',Menlo,monospace;font-size:9px;color:#9c8a76;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;text-align:left;">RDAP</th>
        <th style="padding:0 0 4px;font-family:'DM Mono',Menlo,monospace;font-size:9px;color:#9c8a76;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;text-align:left;">Registrar</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:11px;color:#9c8a76;margin:0;line-height:1.5;">A dash means the source returned no data (API unavailable or not configured).</p>`
}

function dnsLabelEmail(s: string | null): { label: string; color: string } {
  if (s === 'taken') return { label: 'active', color: '#a83232' }
  if (s === 'enotfound') return { label: 'no records', color: '#3d6b3d' }
  if (s === 'error') return { label: 'error', color: '#9c8a76' }
  return { label: '—', color: '#9c8a76' }
}
function rdapLabelEmail(s: string | null): { label: string; color: string } {
  if (s === 'taken') return { label: 'registered', color: '#a83232' }
  if (s === 'available') return { label: 'available', color: '#3d6b3d' }
  return { label: '—', color: '#9c8a76' }
}
function registrarLabelEmail(s: string | null): { label: string; color: string } {
  if (s === 'taken') return { label: 'unavailable', color: '#a83232' }
  if (s === 'available') return { label: 'available', color: '#3d6b3d' }
  return { label: '—', color: '#9c8a76' }
}

function domainColorHex(status: string): string {
  if (status === 'available') return '#3d6b3d'
  if (status === 'taken') return '#a83232'
  if (status === 'likely taken') return '#8a6a1f'
  return '#9c8a76'
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
    lines.push('')
    lines.push(`${String(i + 1).padStart(2, '0')}  ${c.name}  [${c.trademarkRisk} risk]`)
    lines.push(`    Style: ${c.style}`)
    lines.push(`    Rationale: ${c.rationale}`)
    lines.push(`    Trademark notes: ${c.trademarkNotes}`)
    const domainLine = Object.entries(c.domains.tlds)
      .map(([tld, status]) => `.${tld}: ${status}`)
      .join('  |  ')
    if (domainLine) lines.push(`    Domains: ${domainLine}`)
    if (c.domains.tldSignals) {
      lines.push(`    Signal breakdown (DNS | RDAP | Registrar):`)
      for (const [tld, sig] of Object.entries(c.domains.tldSignals)) {
        const d = dnsLabelEmail(sig.dns).label
        const r = rdapLabelEmail(sig.rdap).label
        const rg = registrarLabelEmail(sig.registrar).label
        lines.push(`      .${tld}: ${d}  |  ${r}  |  ${rg}`)
      }
    }
    if (c.domains.alternates.length > 0) {
      lines.push(`    Alternates: ${c.domains.alternates.join(' · ')}`)
    }
  })
  lines.push('')

  lines.push('VERIFY BEFORE YOU COMMIT')
  lines.push('  - USPTO TESS:    https://tmsearch.uspto.gov/search/search-information')
  lines.push('  - EUIPO TMview:  https://www.tmdn.org/tmview/')
  lines.push('  - IP Australia:  https://search.ipaustralia.gov.au/trademarks/search/quick')
  lines.push('  - WHOIS lookup:  https://www.whois.com/whois/')
  lines.push('')
  lines.push('A research short-list, not a legal opinion. Verified registry')
  lines.push('data (USPTO + EUIPO via Signa, WIPO Madrid) paired with real')
  lines.push('domain availability (DNS + RDAP + WhoisJSON), ranked against')
  lines.push('unregisterability criteria. Take it to a trademark attorney')
  lines.push('for formal clearance — saves 1–2 billable hours ($300–600).')
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
