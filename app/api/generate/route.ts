import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { validateEnv } from '@/lib/env'
import type { GenerateRequest } from '@/lib/types'

validateEnv()

export async function POST(req: Request) {
  const body = await req.json() as Partial<GenerateRequest>

  if (!body.description || !body.personality || !body.geography) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let report
  try {
    report = await generateReport(body as GenerateRequest)
  } catch (err) {
    console.error('[generate] Anthropic error:', err)
    return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 502 })
  }

  const reportId = randomUUID()

  try {
    await saveReport(reportId, report)
  } catch (err) {
    console.error('[generate] KV save error:', err)
    return NextResponse.json({ error: 'Failed to save report. Please try again.' }, { status: 503 })
  }

  return NextResponse.json({
    reportId,
    preview: report.candidates.slice(0, 3),
    summary: report.summary,
  })
}
