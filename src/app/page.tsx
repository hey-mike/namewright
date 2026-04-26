import { IntakeForm } from '@/components/IntakeForm'
import { Header } from '@/components/Header'

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FBFBFA]">
      <Header />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-24">
        <IntakeForm />
      </main>
    </div>
  )
}
