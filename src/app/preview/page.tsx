'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FreePreview } from '@/components/FreePreview'
import type { Candidate } from '@/lib/types'

function ErrorPane({ state }: { state: 'no-id' | 'expired' | 'error' }) {
  if (state === 'no-id') {
    return (
      <div>
        <p
          className="mono text-[10px] tracking-widest uppercase mb-3"
          style={{ color: 'var(--color-text-4)' }}
        >
          No report in this link
        </p>
        <p
          className="display font-normal leading-snug mb-5"
          style={{ fontSize: 22, letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
        >
          The link you opened doesn&apos;t include a report ID.
        </p>
        <p className="ink-soft mb-6" style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.7 }}>
          Start a fresh search and we&apos;ll generate one for you.
        </p>
        <Link
          href="/"
          className="btn-primary px-6 py-3 display text-base font-semibold rounded-md inline-flex items-center gap-2"
        >
          Start a new search
        </Link>
      </div>
    )
  }
  if (state === 'expired') {
    return (
      <div>
        <p
          className="mono text-[10px] tracking-widest uppercase mb-3"
          style={{ color: 'var(--color-text-4)' }}
        >
          Browser link expired
        </p>
        <p
          className="display font-normal leading-snug mb-5"
          style={{ fontSize: 22, letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
        >
          This preview link has expired after 7 days.
        </p>
        <p className="ink-soft mb-3" style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.7 }}>
          If you opted in to receive a copy by email at checkout, your full report is in your inbox.
        </p>
        <p className="ink-soft mb-6" style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.7 }}>
          Otherwise, you can run a fresh search — same brief, same time, ~30 seconds.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <Link
            href="/"
            className="btn-primary px-6 py-3 display text-base font-semibold rounded-md inline-flex items-center gap-2"
          >
            Run a new search
          </Link>
        </div>
        <p className="mono ink-softer" style={{ fontSize: 11 }}>
          Need help recovering a paid report? Email{' '}
          <a href="mailto:support@namewright.co" style={{ color: 'var(--color-accent)' }}>
            support@namewright.co
          </a>{' '}
          with your purchase email.
        </p>
      </div>
    )
  }
  return (
    <div>
      <p
        className="mono text-[10px] tracking-widest uppercase mb-3"
        style={{ color: 'var(--color-text-4)' }}
      >
        Something went wrong
      </p>
      <p
        className="display font-normal leading-snug mb-5"
        style={{ fontSize: 22, letterSpacing: '-0.015em', color: 'var(--color-text-1)' }}
      >
        We couldn&apos;t load this report.
      </p>
      <p className="ink-soft mb-6" style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.7 }}>
        This is usually a temporary network issue. Please refresh the page or try again in a moment.
      </p>
      <div className="flex flex-wrap gap-3 mb-8">
        <Link
          href="/"
          className="btn-primary px-6 py-3 display text-base font-semibold rounded-md inline-flex items-center gap-2"
        >
          Start a new search
        </Link>
      </div>
      <p className="mono ink-softer" style={{ fontSize: 11 }}>
        Still stuck? Email{' '}
        <a href="mailto:support@namewright.co" style={{ color: 'var(--color-accent)' }}>
          support@namewright.co
        </a>{' '}
        and we&apos;ll dig in.
      </p>
    </div>
  )
}

function PreviewContent() {
  const params = useSearchParams()
  const reportId = params.get('report_id') ?? ''
  const [summary, setSummary] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [totalCount, setTotalCount] = useState(0)
  // `loading` starts true when there's a reportId so first paint shows the
  // loading state instead of flashing the not-found view while the effect
  // fires. Without a reportId there's nothing to load.
  const [loading, setLoading] = useState(!!reportId)
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'expired' | 'error'>('idle')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // Three distinct error states — each with a different recovery message:
  //   'no-id'   : URL is missing report_id (typo, stripped link)
  //   'expired' : reportId looked valid but KV TTL elapsed (the most common
  //               post-purchase failure — the user paid yesterday and the link
  //               has aged out)
  //   'error'   : unexpected fetch failure (network, server, etc.)
  type ErrorState = 'no-id' | 'expired' | 'error' | null
  let errorState: ErrorState = null
  if (!reportId) errorState = 'no-id'
  else if (!loading && fetchStatus === 'expired') errorState = 'expired'
  else if (!loading && fetchStatus === 'error') errorState = 'error'
  else if (!loading && candidates.length === 0) errorState = 'expired'

  // sessionStorage is only available client-side; reads must run after mount
  // so the page can server-render without crashing. The eslint disable is
  // intentional: this is the canonical async-data-on-mount pattern (read
  // sessionStorage cache, fall back to fetch). The state can't be derived
  // during render because sessionStorage doesn't exist on the server.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!reportId) return

    try {
      const stored = sessionStorage.getItem('report_preview')
      if (stored) {
        const parsed = JSON.parse(stored) as Candidate[]
        if (parsed.length > 0) {
          setSummary(sessionStorage.getItem('report_summary') ?? '')
          setCandidates(parsed)
          setTotalCount(Number(sessionStorage.getItem('report_total_count') ?? 0))
          setLoading(false)
          return
        }
      }
    } catch {
      // fall through to fetch
    }

    fetch(`/api/preview?report_id=${reportId}`)
      .then((res) => {
        if (res.status === 404) {
          setFetchStatus('expired')
          return null
        }
        if (!res.ok) {
          setFetchStatus('error')
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        setSummary(data.summary)
        setCandidates(data.preview)
        setTotalCount(data.totalCount)
      })
      .catch(() => setFetchStatus('error'))
      .finally(() => setLoading(false))
  }, [reportId])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleUnlock(reportEmail: string | null) {
    setUnlocking(true)
    setUnlockError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, reportEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      window.location.href = data.url
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setUnlocking(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20">
        <p className="ink-soft text-sm" aria-live="polite">
          Loading…
        </p>
      </main>
    )
  }

  if (errorState) {
    return (
      <main className="max-w-3xl mx-auto px-6 md:px-12 py-20 fade-in">
        <ErrorPane state={errorState} />
      </main>
    )
  }

  return (
    <FreePreview
      summary={summary}
      candidates={candidates}
      totalCount={totalCount}
      onUnlock={handleUnlock}
      unlocking={unlocking}
      unlockError={unlockError}
    />
  )
}

export default function PreviewPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header
        className="max-w-3xl mx-auto px-6 md:px-12 pt-8 pb-5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }}
          />
          <span
            className="display text-sm font-semibold"
            style={{ letterSpacing: '-0.01em', color: 'var(--color-text-1)', fontStyle: 'italic' }}
          >
            Namewright
          </span>
        </div>
      </header>
      <Suspense fallback={<div className="p-20 text-sm ink-soft">Loading…</div>}>
        <PreviewContent />
      </Suspense>
    </div>
  )
}
