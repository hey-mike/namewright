'use client'
import { useState } from 'react'
import type { Candidate, DomainSignals } from '@/lib/types'

const RISK_COLORS: Record<Candidate['trademarkRisk'], string> = {
  low: 'var(--color-success)',
  moderate: 'var(--color-warning)',
  high: 'var(--color-error)',
  uncertain: 'var(--color-text-4)',
}

function domainStatus(s: string) {
  if (s === 'available') return { label: 'available', color: 'var(--color-success)' }
  if (s === 'taken') return { label: 'taken', color: 'var(--color-error)' }
  if (s === 'likely taken') return { label: 'likely taken', color: 'var(--color-error)' }
  return { label: 'uncertain', color: 'var(--color-text-4)' }
}

// Human-readable labels for the per-source signal matrix. Each function
// maps the raw enum used by dns.ts into a short phrase a founder can read
// without needing to know what RDAP or WhoisJSON are.
function dnsLabel(s: DomainSignals['dns']): { label: string; color: string } {
  if (s === 'taken') return { label: 'active', color: 'var(--color-error)' }
  if (s === 'enotfound') return { label: 'no records', color: 'var(--color-success)' }
  if (s === 'error') return { label: 'error', color: 'var(--color-text-4)' }
  return { label: '—', color: 'var(--color-text-4)' }
}
function rdapLabel(s: DomainSignals['rdap']): { label: string; color: string } {
  if (s === 'taken') return { label: 'registered', color: 'var(--color-error)' }
  if (s === 'available') return { label: 'available', color: 'var(--color-success)' }
  return { label: '—', color: 'var(--color-text-4)' }
}
function registrarLabel(s: DomainSignals['registrar']): { label: string; color: string } {
  if (s === 'taken') return { label: 'unavailable', color: 'var(--color-error)' }
  if (s === 'available') return { label: 'available', color: 'var(--color-success)' }
  return { label: '—', color: 'var(--color-text-4)' }
}

// Collapsed-row indicator: maps a per-source signal to a single letter colored
// by status. Green = available, red = taken/active, muted = no data. Letters
// (D/R/W) read at a glance without needing to open the row.
type SignalGlyph = { color: string; title: string }

function dnsGlyph(s: DomainSignals['dns']): SignalGlyph {
  if (s === 'taken') return { color: 'var(--color-error)', title: 'DNS: active records' }
  if (s === 'enotfound') return { color: 'var(--color-success)', title: 'DNS: no records found' }
  if (s === 'error') return { color: 'var(--color-text-4)', title: 'DNS: lookup error' }
  return { color: 'var(--color-text-4)', title: 'DNS: no data' }
}
function rdapGlyph(s: DomainSignals['rdap']): SignalGlyph {
  if (s === 'taken') return { color: 'var(--color-error)', title: 'RDAP: registered' }
  if (s === 'available') return { color: 'var(--color-success)', title: 'RDAP: available' }
  return { color: 'var(--color-text-4)', title: 'RDAP: no data' }
}
function registrarGlyph(s: DomainSignals['registrar']): SignalGlyph {
  if (s === 'taken') return { color: 'var(--color-error)', title: 'WhoisJSON: unavailable' }
  if (s === 'available') return { color: 'var(--color-success)', title: 'WhoisJSON: available' }
  return { color: 'var(--color-text-4)', title: 'WhoisJSON: no data' }
}

export function CandidateRow({
  c,
  index,
  defaultOpen = false,
  previewLocked = false,
}: {
  c: Candidate
  index: number
  defaultOpen?: boolean
  /** When true (free preview, candidates 2-3), hide trademark notes + alternates
   * so the paywall promise of "detailed trademark notes" is real. Rationale +
   * domain status table stay visible — those are the at-a-glance value.
   */
  previewLocked?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  const riskColor = RISK_COLORS[c.trademarkRisk]
  const tldSignals = c.domains.tldSignals

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
            className="display text-3xl md:text-4xl font-semibold truncate"
            style={{ letterSpacing: '-0.025em' }}
          >
            {c.name}
          </h3>
          <span className="mono text-[10px] tracking-widest ink-softer uppercase hidden md:inline">
            {c.style}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {tldSignals && (
            <span
              className="mono text-[10px] tracking-wider uppercase hidden lg:flex items-center gap-3"
              aria-label="Per-source domain signals"
            >
              {Object.entries(tldSignals).map(([tld, sig]) => {
                const d = dnsGlyph(sig.dns)
                const r = rdapGlyph(sig.rdap)
                const w = registrarGlyph(sig.registrar)
                return (
                  <span key={tld} className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--color-text-4)' }}>.{tld}</span>
                    <span className="flex items-center gap-0.5">
                      <span style={{ color: d.color }} title={d.title}>
                        D
                      </span>
                      <span style={{ color: r.color }} title={r.title}>
                        R
                      </span>
                      <span style={{ color: w.color }} title={w.title}>
                        W
                      </span>
                    </span>
                  </span>
                )
              })}
            </span>
          )}
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
            <p
              className="leading-relaxed mb-4 ink-soft"
              style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75 }}
            >
              {c.rationale}
            </p>
            {previewLocked ? (
              <p
                className="mono text-[11px] ink-softer leading-relaxed"
                style={{ fontStyle: 'italic' }}
              >
                Detailed trademark notes available in the full report ↓
              </p>
            ) : (
              <>
                <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">
                  Trademark notes
                </p>
                <p
                  className="leading-relaxed ink-soft"
                  style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.75 }}
                >
                  {c.trademarkNotes}
                </p>
              </>
            )}
          </div>
          <div>
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-3">Domains</p>
            <ul className="space-y-1.5 mb-4">
              {Object.entries(c.domains.tlds).map(([tld, status]) => {
                const s = domainStatus(status)
                return (
                  <li key={tld} className="flex items-baseline justify-between text-sm">
                    <span className="mono" style={{ fontSize: 13 }}>
                      {c.name.toLowerCase()}.{tld}
                    </span>
                    <span className="mono tracking-wider" style={{ fontSize: 11, color: s.color }}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ul>
            {c.domains.tldSignals && (
              <div className="mb-3">
                <p
                  className="mono text-[10px] tracking-widest uppercase mb-2"
                  style={{ color: 'var(--color-text-4)' }}
                >
                  Signal breakdown
                </p>
                <p
                  className="mono text-[10px] leading-relaxed mb-2"
                  style={{ color: 'var(--color-text-4)' }}
                >
                  DNS = active records on the domain. RDAP = registry record. WhoisJSON =
                  third-party registrar lookup.
                </p>
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th
                        className="mono text-left pb-1 pr-3"
                        style={{
                          color: 'var(--color-text-4)',
                          fontWeight: 400,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontSize: 10,
                        }}
                      />
                      <th
                        className="mono text-left pb-1 pr-3"
                        style={{
                          color: 'var(--color-text-4)',
                          fontWeight: 400,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontSize: 10,
                        }}
                      >
                        DNS
                      </th>
                      <th
                        className="mono text-left pb-1 pr-3"
                        style={{
                          color: 'var(--color-text-4)',
                          fontWeight: 400,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontSize: 10,
                        }}
                      >
                        RDAP
                      </th>
                      <th
                        className="mono text-left pb-1"
                        style={{
                          color: 'var(--color-text-4)',
                          fontWeight: 400,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontSize: 10,
                        }}
                      >
                        WhoisJSON
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(c.domains.tldSignals).map(([tld, sig]) => {
                      const d = dnsLabel(sig.dns)
                      const r = rdapLabel(sig.rdap)
                      const rg = registrarLabel(sig.registrar)
                      return (
                        <tr key={tld}>
                          <td className="mono py-1 pr-3" style={{ color: 'var(--color-text-3)' }}>
                            .{tld}
                          </td>
                          <td className="mono py-1 pr-3" style={{ color: d.color }}>
                            {d.label}
                          </td>
                          <td className="mono py-1 pr-3" style={{ color: r.color }}>
                            {r.label}
                          </td>
                          <td className="mono py-1" style={{ color: rg.color }}>
                            {rg.label}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p
                  className="mono text-[10px] leading-relaxed mt-2"
                  style={{ color: 'var(--color-text-4)' }}
                >
                  Final status combines these signals. A dash means the source returned no data (API
                  unavailable or not configured).
                </p>
              </div>
            )}
            {Object.values(c.domains.tlds).some(
              (s) => s === 'uncertain' || s === 'likely taken'
            ) && (
              <p className="mono text-[10px] ink-softer leading-relaxed mb-3">
                Likely taken reflects active DNS only. Uncertain means DNS was inconclusive or
                contradicted by registration data. Verify with a domain registrar before acting.
              </p>
            )}
            {!previewLocked && c.domains.alternates.length > 0 && (
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
