import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import type { GenerateRequest } from '@/lib/types'

export async function POST(req: Request) {
  const body = await req.json() as Partial<GenerateRequest>

  if (!body.description || !body.personality || !body.geography) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const report = await generateReport(body as GenerateRequest)
  const reportId = randomUUID()

  await saveReport(reportId, report)

  return NextResponse.json({
    reportId,
    preview: report.candidates.slice(0, 3),
    summary: report.summary,
  })
}
