import { type NextRequest, NextResponse } from 'next/server'
import { getReport } from '@/lib/r2'

export async function GET(request: NextRequest) {
  const reportId = request.nextUrl.searchParams.get('report_id')

  if (!reportId) {
    return NextResponse.json({ error: 'report_id is required' }, { status: 400 })
  }

  const report = await getReport(reportId)

  if (!report) {
    return NextResponse.json({ error: 'Report not found or expired' }, { status: 404 })
  }

  return NextResponse.json({
    summary: report.summary,
    preview: report.candidates.slice(0, 3),
    totalCount: report.candidates.length,
  })
}
