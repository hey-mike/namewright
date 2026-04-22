'use client'
import type { Candidate } from '@/lib/types'
import { CandidateRow } from './CandidateRow'

interface FreePreviewProps {
  summary: string
  candidates: Candidate[]
  totalCount: number
  onUnlock: () => void
  unlocking: boolean
  unlockError?: string | null
}

export function FreePreview({
  summary,
  candidates,
  totalCount,
  onUnlock,
  unlocking,
  unlockError,
}: FreePreviewProps) {
  const hiddenCount = totalCount - candidates.length

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
          className="display text-xl md:text-2xl font-medium leading-snug"
          style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
        >
          {summary}
        </p>
      </section>

      <section className="mb-8">
        <p
          className="mono text-[10px] tracking-widest uppercase mb-6"
          style={{ color: 'var(--color-text-4)' }}
        >
          Top 3 candidates
        </p>
        {candidates.map((c, i) => (
          <CandidateRow key={c.name} c={c} index={i} defaultOpen={i === 0} />
        ))}
      </section>

      <section className="relative">
        <div className="select-none pointer-events-none" aria-hidden>
          {Array.from({ length: hiddenCount }).map((_, i) => (
            <div
              key={i}
              className="py-4 flex items-baseline gap-6 blur-sm opacity-30"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span className="mono text-xs ink-softer w-6">{String(i + 4).padStart(2, '0')}</span>
              <div
                className="display text-2xl font-semibold"
                style={{ color: 'var(--color-text-1)', letterSpacing: '-0.025em' }}
              >
                {'—'.repeat(5 + (i % 4))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--color-bg) 50%)' }}
        >
          <div className="text-center py-10">
            <svg
              className="mx-auto mb-4"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="var(--color-text-4)"
                strokeWidth="1.5"
              />
              <path
                d="M8 11V7a4 4 0 0 1 8 0v4"
                stroke="var(--color-text-4)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <p
              className="display text-2xl font-semibold mb-2"
              style={{ color: 'var(--color-text-1)', letterSpacing: '-0.02em' }}
            >
              {hiddenCount} more candidates
            </p>
            <p className="text-sm ink-soft mb-6 max-w-xs mx-auto leading-relaxed">
              Full report includes top 3 picks with next steps, detailed trademark notes, and all
              domain alternatives.
            </p>
            <button
              onClick={onUnlock}
              disabled={unlocking}
              className="btn-primary px-6 py-3 display text-base font-semibold rounded inline-flex items-center gap-2"
            >
              {unlocking ? 'Redirecting…' : 'Unlock full report'}
              <span className="font-normal opacity-70">$19</span>
            </button>
            {unlockError && (
              <p className="mono text-xs mt-3" style={{ color: 'oklch(0.480 0.170 22)' }}>
                {unlockError}
              </p>
            )}
            {!unlockError && (
              <p className="mono text-[11px] mt-3 ink-softer">One-time payment · No subscription</p>
            )}
            <p className="mono text-[11px] mt-2 ink-softer">
              Report accessible for 24 hours · download to keep
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
