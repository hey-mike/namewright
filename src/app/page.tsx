import { IntakeForm } from '@/components/IntakeForm'

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FBFBFA]">
      <header className="border-b border-[rgba(0,0,0,0.06)] bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF4F00]" />
            <span className="mono text-xs font-bold tracking-widest uppercase text-zinc-900">
              Namewright
            </span>
          </div>
          <div className="mono text-[10px] text-[#787774] uppercase tracking-widest">
            Pre-Incorporation
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-24">
        <IntakeForm />
      </main>
    </div>
  )
}
