import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'
import { getReport } from '@/lib/r2'
import { FullReport } from '@/components/FullReport'

// Next.js 15: searchParams is a Promise in server components
interface Props {
  searchParams: Promise<{ report_id?: string }>
}

export default async function ResultsPage({ searchParams }: Props) {
  const { report_id: reportId } = await searchParams
  if (!reportId) redirect('/')

  // Next.js 15: cookies() is async
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value ?? ''
  const session = await verifySession(token)

  if (!session || !session.paid) {
    redirect(`/preview?report_id=${reportId}`)
  }

  let isAuthorized = false
  if (session.userId) {
    const { prisma } = await import('@/lib/db')
    const record = await prisma.reportRecord.findUnique({
      where: { id: reportId },
    })
    if (record && record.userId === session.userId) {
      isAuthorized = true
    }
  } else if (session.reportId === reportId) {
    isAuthorized = true
  }

  if (!isAuthorized) {
    redirect(`/preview?report_id=${reportId}`)
  }

  const report = await getReport(reportId)
  if (!report) redirect('/?expired=1')

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
        <span className="mono text-[11px] ink-softer">
          {report.candidates.length} candidates · trademark research included
        </span>
      </header>
      <FullReport report={report} reportId={reportId} />
    </div>
  )
}
