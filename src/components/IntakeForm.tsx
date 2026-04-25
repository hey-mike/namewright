'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_TLDS, DEFAULT_TLDS } from '@/lib/types'

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

// Dev-only toggle state — picks between mock fixture and real pipeline per-request.
// Never rendered or honored in production builds (NODE_ENV === 'production').
// See src/lib/anthropic.ts `generateReport()` for the server-side production guard.
const DEV_MODE = process.env.NODE_ENV === 'development'
const PIPELINE_MODE_KEY = 'nw_pipeline_mode' // 'mock' | 'real'
type PipelineMode = 'mock' | 'real'

function readPipelineModeFromStorage(): PipelineMode {
  if (typeof window === 'undefined') return 'mock'
  const stored = window.localStorage.getItem(PIPELINE_MODE_KEY)
  return stored === 'real' ? 'real' : 'mock'
}

export function IntakeForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    description: '',
    personality: '',
    constraints: '',
    geography: '',
    tlds: DEFAULT_TLDS as string[],
    nameType: 'company' as 'company' | 'product',
  })
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Click-toggle popover for the brand-personality strength explainer.
  // Click-driven (not hover) so it's keyboard-reachable; closes on outside
  // click or Escape via the effect below.
  const [personalityInfoOpen, setPersonalityInfoOpen] = useState(false)
  useEffect(() => {
    if (!personalityInfoOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPersonalityInfoOpen(false)
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-personality-info]')) setPersonalityInfoOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDocClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDocClick)
    }
  }, [personalityInfoOpen])
  // Dev-only state — read from localStorage on mount so the toggle persists
  // across page reloads within a dev session. SSR-safe hydration pattern: the
  // server has no access to localStorage, so we start with the default and
  // reconcile on the client after mount.
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('mock')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (DEV_MODE) setPipelineMode(readPipelineModeFromStorage())
  }, [])

  function togglePipelineMode() {
    const next: PipelineMode = pipelineMode === 'mock' ? 'real' : 'mock'
    setPipelineMode(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(PIPELINE_MODE_KEY, next)
  }

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
      // Build headers — attach x-dev-mock-pipeline only in dev builds.
      // Server hard-refuses this header in production (VERCEL_ENV check).
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (DEV_MODE) {
        headers['x-dev-mock-pipeline'] = pipelineMode === 'mock' ? '1' : '0'
      }
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers,
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

  if (loading) {
    // Calculate progress percentage based on loadingStep
    const progress = Math.min(100, Math.max(10, loadingStep * 25 + 15))

    return (
      <div className="w-full h-full flex flex-col md:flex-row border border-[#EAEAEA] bg-white min-h-[600px]">
        {/* Left: Immersive Terminal */}
        <div className="w-full md:w-3/5 bg-[#111111] text-[#EAEAEA] p-8 md:p-12 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-6">
            <span className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
              Pipeline Active
            </span>
            <span className="mono text-xs text-zinc-500">{progress}%</span>
          </div>

          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-8">
            <div
              className="h-full bg-[#FF4F00] transition-all duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {/* Terminal Log Stream */}
          <div
            className="flex-1 font-mono text-[11px] leading-relaxed space-y-2 overflow-y-auto"
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
            }}
          >
            <div className="text-zinc-500">[System] Initializing pipeline...</div>
            {loadingStep >= 0 && (
              <div className="text-emerald-500">[Agent] Synthesizing brief criteria.</div>
            )}
            {loadingStep >= 1 && (
              <div className="text-zinc-400">[Agent] Generating candidate batch...</div>
            )}
            {loadingStep >= 1 && (
              <div className="text-emerald-500">
                [Agent] 12 candidates generated. Initiating parallel verification.
              </div>
            )}
            {loadingStep >= 2 && (
              <div className="text-zinc-400">[Signa] Querying USPTO TESS database...</div>
            )}
            {loadingStep >= 2 && (
              <div className="text-emerald-500">[Signa] Cross-referencing EUIPO records...</div>
            )}
            {loadingStep >= 3 && (
              <div className="text-zinc-400">[DNS] Probing Layer 1 availability...</div>
            )}
            {loadingStep >= 3 && (
              <div className="text-zinc-400">[RDAP] Resolving Layer 2 WHOIS...</div>
            )}

            <div className="flex gap-2 text-white font-bold animate-pulse-fast mt-4">
              <span className="text-[#FF4F00]">█</span>
              <span>{PIPELINE_STEPS[loadingStep] || 'Finalizing...'}</span>
            </div>
          </div>
        </div>

        {/* Right: Editorial Content */}
        <div className="w-full md:w-2/5 p-8 md:p-12 flex flex-col justify-center bg-[#FBFBFA] border-l border-[#EAEAEA]">
          <span className="mono text-[10px] uppercase tracking-widest text-[#787774] mb-4">
            While you wait
          </span>
          <h3 className="serif text-3xl font-medium leading-tight mb-4 text-[#111111]">
            Descriptive vs. Distinctive
          </h3>
          <p className="text-sm text-[#787774] leading-relaxed">
            Names that literally describe what you do (like &quot;FastMail&quot;) are incredibly
            difficult to trademark. The strongest brands use distinctive, arbitrary, or coined words
            (like &quot;Apple&quot; for computers).
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {DEV_MODE && (
        <button
          type="button"
          onClick={togglePipelineMode}
          aria-label={`Pipeline mode: ${pipelineMode}. Click to toggle.`}
          title={
            pipelineMode === 'mock'
              ? 'Mock pipeline — returns canned fixture, zero API cost. Click for real.'
              : 'REAL pipeline — calls Anthropic + Signa + WhoisJSON (costs money). Click for mock.'
          }
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 50,
            padding: '6px 12px',
            borderRadius: 999,
            fontFamily: 'var(--font-mono, ui-monospace)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: '1px solid var(--color-border)',
            background:
              pipelineMode === 'mock' ? 'var(--color-input-bg)' : 'var(--color-warning-bg)',
            color: pipelineMode === 'mock' ? 'var(--color-text-3)' : 'var(--color-warning-txt)',
            transition: `background 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          {pipelineMode === 'mock' ? 'dev · mock' : '⚠ dev · real'}
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="col-span-1 lg:col-span-5 space-y-6">
          <h1 className="serif text-5xl md:text-7xl font-medium tracking-tight leading-[0.9] text-[#111111]">
            Name your brand.
            <br />
            <span className="italic text-[#787774]">Before you commit.</span>
          </h1>
          <p className="text-lg text-[#787774] leading-relaxed max-w-md">
            Submit a brief, get 8–12 ranked name candidates with preliminary trademark screening and
            domain availability.
          </p>
        </div>

        <div className="col-span-1 lg:col-span-7">
          <div className="card-container p-8 md:p-12 space-y-10">
            {/* 01 / Description & Name Type */}
            <div className="space-y-3">
              <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
                01 / Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What are you building? Who is it for?"
                className="w-full bg-[#FBFBFA] border border-[#EAEAEA] p-4 font-sans text-sm focus:border-[#FF4F00] focus:ring-1 focus:ring-[#FF4F00] outline-none transition-all resize-none min-h-[120px]"
              />

              <div className="flex flex-wrap gap-2 mt-4">
                {(
                  [
                    { value: 'company', label: 'A company' },
                    { value: 'product', label: 'A product' },
                  ] as const
                ).map((opt) => {
                  const selected = form.nameType === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, nameType: opt.value })}
                      className={`px-4 py-2 text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-white text-[#787774] border-[#EAEAEA] hover:border-[#111111] hover:text-[#111111]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 02 / Personality */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
                  02 / Personality
                </label>
                <span data-personality-info className="relative inline-flex items-center">
                  <button
                    type="button"
                    aria-label="Why personality matters for trademark strength"
                    aria-expanded={personalityInfoOpen}
                    onClick={() => setPersonalityInfoOpen((v) => !v)}
                    className="inline-flex items-center justify-center rounded-full bg-white border border-[#EAEAEA] text-[#787774] hover:border-[#111111] hover:text-[#111111] transition-colors"
                    style={{
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      lineHeight: 1,
                      fontFamily: 'var(--font-mono, ui-monospace)',
                    }}
                  >
                    i
                  </button>
                  {personalityInfoOpen && (
                    <span
                      role="tooltip"
                      className="absolute top-[calc(100%+8px)] left-0 z-10 w-[280px] p-3 rounded-sm border border-[#EAEAEA] bg-white text-xs leading-relaxed text-[#787774] shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
                    >
                      Names that <em>describe</em> what you do (FastPay, QuickShip) are weak
                      trademarks. Names that <em>evoke</em> without describing (Stripe, Cloudflare)
                      are stronger. We weight personality chips to bias toward distinctive styles.
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERSONALITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, personality: p })}
                    className={`px-4 py-2 text-xs font-medium border transition-colors ${
                      form.personality === p
                        ? 'bg-[#111111] text-white border-[#111111]'
                        : 'bg-white text-[#787774] border-[#EAEAEA] hover:border-[#111111] hover:text-[#111111]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 03 / Constraints */}
            <div className="space-y-3">
              <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
                03 / Constraints{' '}
                <span className="text-[#787774] font-normal lowercase">(optional)</span>
              </label>
              <input
                type="text"
                value={form.constraints}
                onChange={(e) => setForm({ ...form, constraints: e.target.value })}
                placeholder="e.g. Under 8 characters. Must be pronounceable in Mandarin."
                className="w-full bg-[#FBFBFA] border border-[#EAEAEA] p-4 font-sans text-sm focus:border-[#FF4F00] focus:ring-1 focus:ring-[#FF4F00] outline-none transition-all"
              />
            </div>

            {/* 04 / Primary Market */}
            <div className="space-y-3">
              <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
                04 / Primary Market
              </label>
              <div className="flex flex-wrap gap-2">
                {GEOGRAPHIES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, geography: g })}
                    className={`px-4 py-2 text-xs font-medium border transition-colors ${
                      form.geography === g
                        ? 'bg-[#111111] text-white border-[#111111]'
                        : 'bg-white text-[#787774] border-[#EAEAEA] hover:border-[#111111] hover:text-[#111111]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* 05 / Domain Extensions */}
            <div className="space-y-3">
              <label className="mono text-[10px] font-bold uppercase tracking-widest text-[#FF4F00]">
                05 / Domain Extensions{' '}
                <span className="text-[#787774] font-normal lowercase">(up to 5)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_TLDS.map((tld) => {
                  const selected = form.tlds.includes(tld)
                  return (
                    <button
                      key={tld}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          if (form.tlds.length === 1) return
                          setForm({ ...form, tlds: form.tlds.filter((t) => t !== tld) })
                        } else {
                          if (form.tlds.length >= 5) return
                          setForm({ ...form, tlds: [...form.tlds, tld] })
                        }
                      }}
                      className={`px-4 py-2 text-xs font-medium border transition-colors mono ${
                        selected
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-white text-[#787774] border-[#EAEAEA] hover:border-[#111111] hover:text-[#111111]'
                      }`}
                    >
                      .{tld}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Submit Button & Error */}
            <div className="pt-4 border-t border-[#EAEAEA]">
              {error && <p className="mono text-xs text-red-500 mb-4">{error}</p>}
              <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary w-full">
                Generate Report ($19)
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
