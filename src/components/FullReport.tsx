import Link from 'next/link'
import type { ReportData } from '@/lib/types'
import { CandidateRow } from './CandidateRow'
import { PdfExportButton } from './PdfExportButton'
import { AffiliateLinks } from './AffiliateLinks'

const VERIFY_LINKS = [
  {
    label: 'USPTO TESS trademark search (US)',
    url: 'https://tmsearch.uspto.gov/search/search-information',
  },
  {
    label: 'IP Australia trademark search',
    url: 'https://search.ipaustralia.gov.au/trademarks/search/quick',
  },
  { label: 'EUIPO trademark search (EU)', url: 'https://www.tmdn.org/tmview/' },
  { label: 'WHOIS domain lookup', url: 'https://www.whois.com/whois/' },
]

export function FullReport({ report }: { report: ReportData }) {
  const today = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main className="max-w-3xl mx-auto px-6 md:px-12 py-10 fade-in">
      <section className="mb-10 pb-8" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <p
          className="mono text-[10px] tracking-widest uppercase mb-3"
          style={{ color: 'var(--color-text-4)' }}
        >
          Brief
        </p>
        <p
          className="display text-xl md:text-2xl font-medium italic leading-snug"
          style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
        >
          &ldquo;{report.summary}&rdquo;
        </p>
      </section>

      {report.topPicks.length > 0 && (
        <section className="mb-14">
          <p
            className="mono text-[10px] tracking-widest uppercase mb-6"
            style={{ color: 'var(--color-text-4)' }}
          >
            Top 3 recommendations
          </p>
          <div className="grid md:grid-cols-3 gap-4 stagger">
            {report.topPicks.map((pick, i) => (
              <div
                key={i}
                className="p-5 rounded"
                style={{
                  background: 'var(--color-accent-lt)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="mono text-[10px] font-bold mb-3 block"
                  style={{ color: 'var(--color-accent)' }}
                >
                  0{i + 1}
                </span>
                <h3
                  className="display text-2xl font-bold mb-3"
                  style={{ letterSpacing: '-0.025em', color: 'var(--color-text-1)' }}
                >
                  {pick.name}
                </h3>
                <p className="text-xs ink-soft leading-relaxed mb-3">{pick.reasoning}</p>
                <div className="pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <p className="mono text-[10px] tracking-widest uppercase mb-1 ink-softer">
                    Next steps
                  </p>
                  <p className="text-xs ink-soft leading-relaxed">{pick.nextSteps}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-14">
        <div
          className="flex items-baseline justify-between mb-6 pb-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <p
            className="mono text-[10px] tracking-widest uppercase"
            style={{ color: 'var(--color-text-4)' }}
          >
            All candidates — ranked
          </p>
          <span className="mono text-[11px] ink-softer">{report.candidates.length} total</span>
        </div>
        {report.candidates.map((c, i) => (
          <CandidateRow key={i} c={c} index={i} defaultOpen={i < 3} />
        ))}
      </section>

      {report.recommendation && (
        <section
          className="mb-14 p-5 rounded"
          style={{ background: 'var(--color-accent-lt)', border: '1px solid var(--color-border)' }}
        >
          <p
            className="mono text-[10px] tracking-widest uppercase mb-3"
            style={{ color: 'var(--color-accent)' }}
          >
            Editor&rsquo;s pick
          </p>
          <p
            className="display text-lg font-medium leading-snug"
            style={{ color: 'var(--color-text-1)', letterSpacing: '-0.02em' }}
          >
            {report.recommendation}
          </p>
        </section>
      )}

      <section className="mb-14">
        <p
          className="mono text-[10px] tracking-widest uppercase mb-4"
          style={{ color: 'var(--color-text-4)' }}
        >
          Ready to act?
        </p>
        <AffiliateLinks />
      </section>

      <section
        className="mb-14 p-4 rounded text-xs ink-soft leading-relaxed"
        style={{ background: 'oklch(0.970 0.020 80)', border: '1px solid oklch(0.900 0.040 80)' }}
      >
        <strong style={{ color: 'var(--color-text-2)' }}>Not legal advice.</strong> This report is
        AI-assisted research based on web search signals as of {today}. Trademark notes are not a
        substitute for a USPTO, EUIPO, or IP Australia registry search. Verify with a qualified IP
        attorney before filing or committing to a name.
      </section>

      <section className="mb-14">
        <p
          className="mono text-[10px] tracking-widest uppercase mb-4"
          style={{ color: 'var(--color-text-4)' }}
        >
          Verify before you commit
        </p>
        <ul className="space-y-3">
          {VERIFY_LINKS.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm pb-0.5"
                style={{
                  color: 'var(--color-accent)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {item.label}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M2 10L10 2M10 2H4M10 2v6"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="mb-6 p-4 rounded text-xs ink-soft leading-relaxed"
        style={{ background: 'oklch(0.970 0.010 250)', border: '1px solid oklch(0.900 0.020 250)' }}
      >
        <strong style={{ color: 'var(--color-text-2)' }}>
          This report expires 24 hours after generation.
        </strong>{' '}
        Download a copy now — once expired, the link will no longer work and the report cannot be
        recovered.
      </section>

      <section
        className="pt-6 flex flex-wrap items-center justify-between gap-4"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div className="flex gap-3">
          <PdfExportButton />
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded inline-flex items-center gap-2"
            style={{
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-1)',
              transition: 'background 0.12s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 2v10M2 7l5-5 5 5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Run another
          </Link>
        </div>
        <p className="mono text-[11px] ink-softer">Report generated {today}</p>
      </section>
    </main>
  )
}
