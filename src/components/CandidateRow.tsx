'use client'
import { useState } from 'react'
import type { Candidate } from '@/lib/types'

const RISK_COLORS: Record<Candidate['trademarkRisk'], string> = {
  low: 'var(--color-success)',
  moderate: 'var(--color-warning)',
  high: 'var(--color-error)',
  uncertain: 'var(--color-text-4)',
}

function domainStatus(s: string) {
  if (s === 'likely available') return { label: 'likely free', color: 'var(--color-success)' }
  if (s === 'likely taken') return { label: 'likely taken', color: 'var(--color-error)' }
  return { label: 'uncertain', color: 'var(--color-text-4)' }
}

export function CandidateRow({
  c,
  index,
  defaultOpen = false,
}: {
  c: Candidate
  index: number
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  const riskColor = RISK_COLORS[c.trademarkRisk]

  return (
    <div className="border-b rule-soft">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-baseline justify-between gap-4 text-left hover:bg-black/[0.02] transition-colors px-2 -mx-2"
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-6 flex-1 min-w-0">
          <span className="mono text-xs ink-softer shrink-0 w-6">
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3
            className="display text-2xl md:text-3xl font-semibold truncate"
            style={{ letterSpacing: '-0.025em' }}
          >
            {c.name}
          </h3>
          <span className="mono text-[10px] tracking-widest ink-softer uppercase hidden md:inline">
            {c.style}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="mono text-[10px] tracking-widest uppercase" style={{ color: riskColor }}>
            {c.trademarkRisk.toUpperCase()} RISK
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
              color: 'var(--color-text-4)',
            }}
          >
            <path
              d="M2.5 5L7 9.5 11.5 5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {open && (
        <div className="pb-6 pl-10 pr-2 grid md:grid-cols-3 gap-6 fade-in">
          <div className="md:col-span-2">
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
              Why it works
            </p>
            <p className="text-sm leading-relaxed mb-4 ink-soft">{c.rationale}</p>
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
              Trademark notes
            </p>
            <p className="text-sm leading-relaxed ink-soft">{c.trademarkNotes}</p>
          </div>
          <div>
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-3">Domains</p>
            <ul className="space-y-1.5 mb-4">
              {(['com', 'io', 'co'] as const).map((tld) => {
                const s = domainStatus(c.domains[tld])
                return (
                  <li key={tld} className="flex items-baseline justify-between text-sm">
                    <span className="mono text-xs">
                      {c.name.toLowerCase()}.{tld}
                    </span>
                    <span className="mono text-[10px] tracking-wider" style={{ color: s.color }}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ul>
            {c.domains.alternates.length > 0 && (
              <>
                <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                  If taken, try
                </p>
                <ul className="space-y-1">
                  {c.domains.alternates.map((alt) => (
                    <li key={alt} className="mono text-xs ink-soft">
                      {alt}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
