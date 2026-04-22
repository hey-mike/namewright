'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const PERSONALITIES = [
  'Serious / technical',
  'Playful / approachable',
  'Premium / refined',
  'Utilitarian / direct',
  'Bold / contrarian',
]
const GEOGRAPHIES = ['US-first', 'Global', 'Australia / APAC', 'Europe', 'China / Asia']

const PIPELINE_STEPS = [
  'Generating candidates',
  'Checking trademarks',
  'Checking domains',
  'Synthesising report',
]

const DELIVERABLES = [
  '8–12 ranked name candidates',
  'Trademark risk per candidate',
  'Domain availability (.com .io .co)',
  'Top 3 picks with next steps',
]

const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function IntakeForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    description: '',
    personality: '',
    constraints: '',
    geography: '',
  })
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = form.description.trim().length > 10 && form.personality && form.geography

  useEffect(() => {
    if (!loading) return
    const timings = [0, 8000, 18000, 28000]
    const timers = timings.map((delay, i) => setTimeout(() => setLoadingStep(i), delay))
    return () => timers.forEach(clearTimeout)
  }, [loading])

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      sessionStorage.setItem('report_summary', data.summary)
      sessionStorage.setItem('report_preview', JSON.stringify(data.preview))
      sessionStorage.setItem('report_total_count', String(data.totalCount))
      router.push(`/preview?report_id=${data.reportId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const inputBase: React.CSSProperties = {
    fontFamily: 'inherit',
    color: 'var(--color-text-2)',
    background: 'var(--color-input-bg)',
    border: '1px solid var(--color-border)',
    outline: 'none',
    transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = 'var(--color-accent)'
    e.target.style.boxShadow = '0 0 0 3px var(--color-focus-ring)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = 'var(--color-border)'
    e.target.style.boxShadow = 'none'
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-start justify-start px-6 md:px-10 pt-20 fade-in">
        <div className="max-w-xs w-full">
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              border: '1.5px solid var(--color-accent-lt)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              animation: 'spin 0.75s linear infinite',
              marginBottom: '2.5rem',
            }}
          />
          <p
            className="mono text-[10px] tracking-widest uppercase mb-6"
            style={{ color: 'var(--color-text-4)' }}
          >
            Research in progress
          </p>
          <ul className="space-y-5">
            {PIPELINE_STEPS.map((step, i) => {
              const done = i < loadingStep
              const active = i === loadingStep
              return (
                <li
                  key={step}
                  className="flex items-center gap-4"
                  style={{
                    transition: `opacity 0.35s ${EASING}`,
                    opacity: done ? 0.3 : active ? 1 : 0.18,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: done
                        ? 'var(--color-text-4)'
                        : active
                          ? 'var(--color-accent)'
                          : 'var(--color-border-mid)',
                      flexShrink: 0,
                      transition: `background 0.35s ${EASING}`,
                    }}
                  />
                  <span
                    className="display text-2xl font-semibold"
                    style={{
                      letterSpacing: '-0.025em',
                      color: active ? 'var(--color-text-1)' : 'var(--color-text-3)',
                      transition: `color 0.35s ${EASING}`,
                      textDecoration: done ? 'line-through' : 'none',
                    }}
                  >
                    {step}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left: hero + deliverables */}
        <div
          className="px-6 md:px-10 py-12 md:py-20 flex flex-col gap-10 md:border-r fade-in"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h1
              className="display font-bold mb-5"
              style={{
                fontSize: 'clamp(1.9rem, 3.6vw, 2.9rem)',
                letterSpacing: '-0.03em',
                color: 'var(--color-text-1)',
                lineHeight: 1.06,
              }}
            >
              Name your brand
              <br />
              defensibly.
            </h1>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--color-text-3)', maxWidth: '34ch' }}
            >
              Submit a brief. We research ranked candidates against trademark registries and domain
              availability — structured report in under a minute.
            </p>
          </div>

          <div
            className="hidden md:block pt-8"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <p
              className="mono text-[10px] tracking-widest uppercase mb-5"
              style={{ color: 'var(--color-text-4)' }}
            >
              Each report includes
            </p>
            <ul className="space-y-3.5">
              {DELIVERABLES.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 11 11"
                    fill="none"
                    style={{ marginTop: 4, flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 5.5l3 3 5-5"
                      stroke="var(--color-accent)"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden md:flex flex-col gap-2 mt-auto">
            <p
              className="mono text-[10px] tracking-widest uppercase mb-1"
              style={{ color: 'var(--color-text-4)' }}
            >
              Registries searched
            </p>
            {['USPTO', 'EUIPO'].map((reg) => (
              <div key={reg} className="flex items-center gap-2.5">
                <div
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    opacity: 0.45,
                    flexShrink: 0,
                  }}
                />
                <span className="mono text-[10px] tracking-widest ink-softer uppercase">{reg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div className="px-6 md:px-10 md:pl-14 py-12 md:py-20">
          <div className="max-w-lg stagger space-y-8">
            <div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="mono text-xs ink-softer tabular-nums">01</span>
                <label
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}
                  htmlFor="desc"
                >
                  Describe your product
                </label>
              </div>
              <textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Product category, core function, who it's for. A sentence or two."
                rows={3}
                className="w-full p-3 text-sm rounded"
                style={{ ...inputBase, resize: 'none', lineHeight: 1.6 }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p className="mono text-[11px] mt-1.5 ink-softer">
                Be specific about the audience and job-to-be-done.
              </p>
            </div>

            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="mono text-xs ink-softer tabular-nums">02</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}
                >
                  Brand personality
                </span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Brand personality">
                {PERSONALITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, personality: p })}
                    className={`chip px-4 py-2 text-xs font-medium rounded border ${form.personality === p ? 'chip-active' : ''}`}
                    style={
                      form.personality !== p
                        ? {
                            borderColor: 'var(--color-border-mid)',
                            color: 'var(--color-text-2)',
                            background: 'var(--color-input-bg)',
                          }
                        : {}
                    }
                    aria-pressed={form.personality === p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="mono text-xs ink-softer tabular-nums">03</span>
                <label
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}
                  htmlFor="constraints"
                >
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
                style={inputBase}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="mono text-xs ink-softer tabular-nums">04</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-1)', letterSpacing: '-0.01em' }}
                >
                  Primary market
                </span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Primary market">
                {GEOGRAPHIES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, geography: g })}
                    className={`chip px-4 py-2 text-xs font-medium rounded border ${form.geography === g ? 'chip-active' : ''}`}
                    style={
                      form.geography !== g
                        ? {
                            borderColor: 'var(--color-border-mid)',
                            color: 'var(--color-text-2)',
                            background: 'var(--color-input-bg)',
                          }
                        : {}
                    }
                    aria-pressed={form.geography === g}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="mono text-xs" style={{ color: 'oklch(0.480 0.170 22)' }}>
                {error}
              </p>
            )}

            <div className="pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary px-6 py-3 display text-base font-semibold rounded inline-flex items-center gap-2"
              >
                Search registries
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 7h9M8 3.5 11.5 7 8 10.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <p className="mono text-[11px] mt-3 ink-softer">
                AI-assisted · preliminary only · not legal advice
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
