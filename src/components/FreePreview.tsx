'use client'
import { useState } from 'react'
import type { Candidate } from '@/lib/types'
import { CandidateRow } from './CandidateRow'

interface FreePreviewProps {
  summary: string
  candidates: Candidate[]
  totalCount: number
  onUnlock: (email: string | null) => void
  unlocking: boolean
  unlockError?: string | null
}

// Loose client-side validation. The webhook re-validates server-side before
// attempting to send anything, so this is purely to give immediate UI feedback.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function FreePreview({
  summary,
  candidates,
  totalCount,
  onUnlock,
  unlocking,
  unlockError,
}: FreePreviewProps) {
  const hiddenCount = totalCount - candidates.length
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const trimmedEmail = email.trim()
  const emailValid = trimmedEmail === '' || EMAIL_RE.test(trimmedEmail)

  function handleUnlock() {
    onUnlock(trimmedEmail === '' ? null : trimmedEmail)
  }

  function inputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--color-accent)'
    e.target.style.boxShadow = '0 0 0 3px var(--color-focus-ring)'
  }
  function inputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = emailValid ? 'var(--color-border-mid)' : 'var(--color-error)'
    e.target.style.boxShadow = 'none'
    setEmailTouched(true)
  }

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
          className="display font-normal leading-snug"
          style={{ fontSize: 26, letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
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
          <CandidateRow key={c.name} c={c} index={i} defaultOpen={i === 0} previewLocked={i > 0} />
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
            <div
              className="mx-auto mb-4"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid var(--color-border-mid)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden="true"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
            </div>
            <p
              className="display text-2xl font-semibold mb-2"
              style={{ color: 'var(--color-text-1)', letterSpacing: '-0.02em' }}
            >
              {hiddenCount} more candidates
            </p>
            <p
              className="ink-soft mb-6 max-w-xs mx-auto leading-relaxed"
              style={{ fontSize: 14, fontWeight: 300 }}
            >
              Full report includes top 3 picks with next steps, detailed trademark notes, and all
              domain alternatives.
            </p>

            <div className="max-w-xs mx-auto mb-5 text-left">
              <label
                htmlFor="report-email"
                className="mono ink-softer block mb-1.5"
                style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}
              >
                Email me a copy{' '}
                <span style={{ textTransform: 'none', letterSpacing: 0 }} className="ink-soft">
                  · recommended
                </span>
              </label>
              <input
                id="report-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={inputFocus}
                onBlur={inputBlur}
                placeholder="you@example.com"
                aria-invalid={emailTouched && !emailValid}
                className="w-full px-3 py-2 text-sm rounded-md"
                style={{
                  fontFamily: 'inherit',
                  color: 'var(--color-text-2)',
                  background: 'var(--color-input-bg)',
                  border: `1px solid ${emailTouched && !emailValid ? 'var(--color-error)' : 'var(--color-border-mid)'}`,
                  outline: 'none',
                  transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
                }}
              />
              <p className="mono ink-softer mt-1.5 leading-snug" style={{ fontSize: 11 }}>
                {emailTouched && !emailValid
                  ? 'Enter a valid email or leave blank.'
                  : 'Keeps your report past the 24-hour browser link.'}
              </p>
            </div>

            <button
              onClick={handleUnlock}
              disabled={unlocking || (emailTouched && !emailValid)}
              className="btn-primary px-6 py-3 display text-base font-semibold rounded-md inline-flex items-center gap-2"
            >
              {unlocking ? 'Redirecting…' : 'Unlock full report'}
              <span className="font-normal opacity-70">$19</span>
            </button>
            {unlockError && (
              <p className="mono text-xs mt-3" style={{ color: 'var(--color-error)' }}>
                {unlockError}
              </p>
            )}
            {!unlockError && (
              <p className="mono mt-3 ink-softer" style={{ fontSize: 11 }}>
                One-time payment · No subscription
              </p>
            )}
            <p
              className="mono mt-2 ink-soft max-w-xs mx-auto leading-snug"
              style={{ fontSize: 11 }}
            >
              7-day refund — email{' '}
              <a href="mailto:support@namewright.co" style={{ color: 'var(--color-accent)' }}>
                support@namewright.co
              </a>{' '}
              if it didn&apos;t help.
            </p>
            <p className="mono mt-3 ink-softer" style={{ fontSize: 11 }}>
              Domain and trademark data as of{' '}
              {new Date().toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
              . Not legal advice.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
