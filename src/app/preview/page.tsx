'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FreePreview } from '@/components/FreePreview'
import type { Candidate } from '@/lib/types'

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
  const [fetchFailed, setFetchFailed] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // notFound is derived during render rather than mutated in effect — it's
  // either obvious from the URL or determinable once loading completes.
  const notFound = !reportId || fetchFailed || (!loading && candidates.length === 0)

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
          setFetchFailed(true)
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
      .catch(() => setFetchFailed(true))
      .finally(() => setLoading(false))
  }, [reportId])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleUnlock() {
    setUnlocking(true)
    setUnlockError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
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

  if (notFound) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20">
        <p className="ink-soft text-sm">
          Report not found or expired.{' '}
          <Link href="/" style={{ color: 'var(--color-accent)' }}>
            Start over
          </Link>
        </p>
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
        <span className="mono text-[11px] ink-softer">Preview report</span>
      </header>
      <Suspense fallback={<div className="p-20 text-sm ink-soft">Loading…</div>}>
        <PreviewContent />
      </Suspense>
    </div>
  )
}
