import type { Metadata } from 'next'
import Link from 'next/link'
import { FullReport } from '@/components/FullReport'
import { SAMPLE_REPORT } from '@/lib/__fixtures__/sample-report'

export const metadata: Metadata = {
  title: 'Sample report — Namewright',
  description:
    'A sample Namewright report — the same format paying customers receive. Brief, candidates, and trademark conflicts are fictional, generated to illustrate the format and depth.',
}

export default function SamplePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header
        className="max-w-3xl mx-auto px-6 md:px-12 pt-8 pb-5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <Link href="/" className="flex items-center gap-2">
          <div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }}
          />
          <span
            className="display text-sm font-semibold"
            style={{ letterSpacing: '-0.01em', color: 'var(--color-text-1)', fontStyle: 'italic' }}
          >
            Namewright
          </span>
        </Link>
        <span className="mono text-[11px] ink-softer">
          {SAMPLE_REPORT.candidates.length} candidates · trademark research included
        </span>
      </header>

      <div className="max-w-3xl mx-auto px-6 md:px-12 pt-6" aria-label="Sample report notice">
        <div
          className="p-4 rounded-md flex flex-col gap-2 md:flex-row md:items-start md:gap-4"
          style={{
            background: 'var(--color-accent-lt)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p
            className="mono text-[10px] tracking-widest uppercase shrink-0 pt-0.5"
            style={{ color: 'var(--color-accent-a)' }}
          >
            Sample
          </p>
          <p
            className="leading-relaxed"
            style={{ fontSize: 14, color: 'var(--color-text-2)', fontWeight: 300 }}
          >
            This is a sample report — the same format you&apos;ll receive after paying $19. The
            brief, candidates, trademark conflicts, owner names, and registration numbers shown here
            are all fabricated, generated to illustrate the depth and structure. Your report will be
            built from your own brief against live trademark and domain registries.
          </p>
        </div>
      </div>

      <FullReport report={SAMPLE_REPORT} />

      <section className="max-w-3xl mx-auto px-6 md:px-12 pb-16" aria-label="Run your own report">
        <div
          className="p-6 md:p-8 rounded-md flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <div>
            <p
              className="display text-lg md:text-xl font-medium leading-snug mb-1"
              style={{ letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
            >
              Ready to run yours?
            </p>
            <p
              className="leading-relaxed"
              style={{ fontSize: 14, color: 'var(--color-text-3)', fontWeight: 300 }}
            >
              Submit your brief — get a report like this one, built against your idea, in minutes.
            </p>
          </div>
          <Link
            href="/"
            className="px-5 py-2.5 text-sm font-medium rounded-md inline-flex items-center gap-2 shrink-0"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-txt)',
              border: '1px solid var(--color-accent)',
            }}
          >
            Try it with your own brief
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 7h8M7 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
