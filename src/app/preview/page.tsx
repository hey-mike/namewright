'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FreePreview } from '@/components/FreePreview'
import type { Candidate } from '@/lib/types'

function PreviewContent() {
  const params = useSearchParams()
  const reportId = params.get('report_id') ?? ''
  const [summary, setSummary] = useState(() =>
    reportId ? (sessionStorage.getItem('report_summary') ?? '') : ''
  )
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    if (!reportId) return []
    try {
      const stored = sessionStorage.getItem('report_preview')
      return stored ? (JSON.parse(stored) as Candidate[]) : []
    } catch {
      return []
    }
  })
  const [totalCount, setTotalCount] = useState(() => {
    if (!reportId) return 0
    return Number(sessionStorage.getItem('report_total_count') ?? 0)
  })
  const [loading, setLoading] = useState(
    () => !!reportId && !sessionStorage.getItem('report_preview')
  )
  const [notFound, setNotFound] = useState(!reportId)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  useEffect(() => {
    // sessionStorage hit already handled by lazy initializers above
    if (!reportId || candidates.length > 0) return

    // sessionStorage empty — fetch from API (direct URL, new tab, shared link)
    fetch(`/api/preview?report_id=${reportId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true)
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
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [reportId])

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
        <p className="ink-soft text-sm">Loading…</p>
      </main>
    )
  }

  if (notFound || !candidates.length) {
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
      reportId={reportId}
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
            className="display text-sm font-bold"
            style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
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
