'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { FreePreview } from '@/components/FreePreview'
import type { Candidate } from '@/lib/types'

function PreviewContent() {
  const params = useSearchParams()
  const router = useRouter()
  const reportId = params.get('report_id') ?? ''
  const [summary, setSummary] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [unlocking, setUnlocking] = useState(false)

  useEffect(() => {
    setSummary(sessionStorage.getItem('report_summary') ?? '')
    const raw = sessionStorage.getItem('report_preview')
    if (raw) {
      try {
        setCandidates(JSON.parse(raw))
      } catch {
        sessionStorage.removeItem('report_preview')
      }
    }
  }, [])

  async function handleUnlock() {
    setUnlocking(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      })
      const { url } = await res.json()
      window.location.href = url
    } catch {
      setUnlocking(false)
    }
  }

  if (!candidates.length) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20">
        <p className="ink-soft text-sm">No report data found. <a href="/" style={{ color: 'var(--color-accent)' }}>Start over</a></p>
      </main>
    )
  }

  return (
    <FreePreview
      summary={summary}
      candidates={candidates}
      totalCount={10}
      reportId={reportId}
      onUnlock={handleUnlock}
      unlocking={unlocking}
    />
  )
}

export default function PreviewPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header className="max-w-3xl mx-auto px-6 md:px-12 pt-8 pb-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
          <span className="display text-sm font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}>Namewright</span>
        </div>
        <span className="mono text-[11px] ink-softer">Preview report</span>
      </header>
      <Suspense fallback={<div className="p-20 text-sm ink-soft">Loading…</div>}>
        <PreviewContent />
      </Suspense>
    </div>
  )
}
