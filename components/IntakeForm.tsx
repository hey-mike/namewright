'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PERSONALITIES = ['Serious / technical', 'Playful / approachable', 'Premium / refined', 'Utilitarian / direct', 'Bold / contrarian']
const GEOGRAPHIES = ['US-first', 'Global', 'Australia / APAC', 'Europe', 'China / Asia']

export function IntakeForm() {
  const router = useRouter()
  const [form, setForm] = useState({ description: '', personality: '', constraints: '', geography: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = form.description.trim().length > 10 && form.personality && form.geography

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      sessionStorage.setItem('report_summary', data.summary)
      sessionStorage.setItem('report_preview', JSON.stringify(data.preview))
      router.push(`/preview?report_id=${data.reportId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 md:px-12 py-20 fade-in">
        <div className="flex flex-col gap-6">
          <div style={{ width: 28, height: 28, border: '2px solid var(--color-accent-lt)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
          <div>
            <p className="mono text-xs tracking-widest mb-2" style={{ color: 'var(--color-accent)', textTransform: 'uppercase' }}>Researching</p>
            <h2 className="display text-3xl font-semibold mb-3" style={{ letterSpacing: '-0.025em', color: 'var(--color-text-1)' }}>
              Generating candidates, researching conflicts.
            </h2>
            <p className="text-sm leading-relaxed ink-soft">Live trademark web search — takes 20–40 seconds.</p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-6 md:px-12 py-10 md:py-16 fade-in">
      <div className="mb-12">
        <p className="mono text-[10px] tracking-widest uppercase mb-4" style={{ color: 'var(--color-accent)' }}>New research brief</p>
        <h1 className="display text-4xl md:text-6xl font-bold mb-4" style={{ letterSpacing: '-0.03em', color: 'var(--color-text-1)', lineHeight: 1.05 }}>
          Name your product<br />defensibly.
        </h1>
        <p className="text-base ink-soft leading-relaxed max-w-xl">
          We cross-verify 8–12 ranked brand name candidates against USPTO, EUIPO, and WIPO Madrid registries — trademark risk and domain availability for each.
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="mono text-xs font-bold" style={{ color: 'var(--color-accent)' }}>01</span>
            <label className="text-sm font-semibold" style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }} htmlFor="desc">Describe your product</label>
          </div>
          <textarea
            id="desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Product category, core function, who it's for. A sentence or two."
            rows={3}
            className="w-full p-3 text-sm rounded"
            style={{
              fontFamily: 'inherit',
              color: 'var(--color-text-2)',
              background: 'white',
              border: '1px solid var(--color-border)',
              outline: 'none',
              resize: 'none',
              lineHeight: 1.6,
              transition: 'border-color 0.12s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
          <p className="mono text-[11px] mt-1.5 ink-softer">Be specific about the audience and job-to-be-done.</p>
        </div>

        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="mono text-xs font-bold" style={{ color: 'var(--color-accent)' }}>02</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}>Brand personality</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Brand personality">
            {PERSONALITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setForm({ ...form, personality: p })}
                className={`chip px-4 py-2 text-xs font-medium rounded border ${form.personality === p ? 'chip-active' : ''}`}
                style={form.personality !== p ? { borderColor: 'var(--color-border)', color: 'var(--color-text-3)', background: 'white' } : {}}
                aria-pressed={form.personality === p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="mono text-xs font-bold" style={{ color: 'var(--color-accent)' }}>03</span>
            <label className="text-sm font-semibold" style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }} htmlFor="constraints">
              Constraints <span className="font-normal ink-softer text-xs">(optional)</span>
            </label>
          </div>
          <input
            type="text"
            id="constraints"
            value={form.constraints}
            onChange={(e) => setForm({ ...form, constraints: e.target.value })}
            placeholder="e.g. Under 8 characters. Must be pronounceable in Mandarin."
            className="w-full p-3 text-sm rounded"
            style={{
              fontFamily: 'inherit',
              color: 'var(--color-text-2)',
              background: 'white',
              border: '1px solid var(--color-border)',
              outline: 'none',
              transition: 'border-color 0.12s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
        </div>

        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="mono text-xs font-bold" style={{ color: 'var(--color-accent)' }}>04</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}>Primary market</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Primary market">
            {GEOGRAPHIES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setForm({ ...form, geography: g })}
                className={`chip px-4 py-2 text-xs font-medium rounded border ${form.geography === g ? 'chip-active' : ''}`}
                style={form.geography !== g ? { borderColor: 'var(--color-border)', color: 'var(--color-text-3)', background: 'white' } : {}}
                aria-pressed={form.geography === g}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mono text-xs" style={{ color: 'oklch(0.480 0.170 22)' }}>{error}</p>}

        <div className="pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary px-6 py-3 display text-base font-semibold rounded inline-flex items-center gap-2"
          >
            Run research
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7h9M8 3.5 11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <p className="mono text-[11px] mt-3 ink-softer">
            ~30 seconds · USPTO · EUIPO · WIPO Madrid searched in parallel
          </p>
        </div>
      </div>
    </main>
  )
}
