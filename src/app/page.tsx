import { IntakeForm } from '@/components/IntakeForm'

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header className="max-w-3xl mx-auto px-6 md:px-12 pt-8 pb-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
          <span className="display text-sm font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}>Namewright</span>
        </div>
        <span className="mono text-[11px] ink-softer">Brand Name Research</span>
      </header>
      <IntakeForm />
    </div>
  )
}
