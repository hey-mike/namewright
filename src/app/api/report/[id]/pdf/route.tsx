import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { renderToBuffer } from '@react-pdf/renderer'
import { verifySession } from '@/lib/session'
import { getReport, getReportPdf, saveReportPdf } from '@/lib/r2'
import { ReportPdfDocument } from '@/components/ReportPdfDocument'
import logger from '@/lib/logger'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reportId } = await params

  const cookieStore = await cookies()
  const session = await verifySession(cookieStore.get('session')?.value ?? '')
  if (!session || !session.paid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auth gate mirrors /results: a userId cookie must own the report via
  // ReportRecord; a single-report cookie must match the requested reportId.
  let authorized = false
  if (session.userId) {
    const { prisma } = await import('@/lib/db')
    const record = await prisma.reportRecord.findUnique({ where: { id: reportId } })
    if (record && record.userId === session.userId) authorized = true
  } else if (session.reportId === reportId) {
    authorized = true
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let buffer = await getReportPdf(reportId)

  // Fallback: render on demand for reports generated before this feature
  // shipped, or when the Inngest PDF step failed. Write through so the next
  // request hits the stored copy.
  if (!buffer) {
    const report = await getReport(reportId)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const today = new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    buffer = await renderToBuffer(<ReportPdfDocument report={report} today={today} />)

    try {
      await saveReportPdf(reportId, buffer)
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), reportId },
        'pdf write-through cache save failed (served anyway)'
      )
    }
  }

  const filename = `namewright-${reportId}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
