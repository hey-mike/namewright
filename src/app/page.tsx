import { IntakeForm } from '@/components/IntakeForm'

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-6xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-accent)',
              }}
            />
            <span
              className="display text-sm font-bold"
              style={{ letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}
            >
              Namewright
            </span>
          </div>
          <span className="mono text-[11px] ink-softer">namewright.co</span>
        </div>
      </header>
      <IntakeForm />
    </div>
  )
}
