import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { validateEnv } from '@/lib/env'
import type { GenerateRequest } from '@/lib/types'

export async function POST(req: Request) {
  validateEnv()
  let body: Partial<GenerateRequest>
  try {
    body = (await req.json()) as Partial<GenerateRequest>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.description || !body.personality || !body.geography) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (body.description.length > 1000) {
    return NextResponse.json(
      { error: 'description must be 1000 characters or fewer' },
      { status: 400 }
    )
  }
  if (body.personality.length > 100) {
    return NextResponse.json(
      { error: 'personality must be 100 characters or fewer' },
      { status: 400 }
    )
  }
  if (body.geography.length > 100) {
    return NextResponse.json(
      { error: 'geography must be 100 characters or fewer' },
      { status: 400 }
    )
  }
  if (body.constraints && body.constraints.length > 500) {
    return NextResponse.json(
      { error: 'constraints must be 500 characters or fewer' },
      { status: 400 }
    )
  }

  let report
  try {
    report = await generateReport(body as GenerateRequest)
  } catch (err) {
    console.error(
      '[generate] report generation failed:',
      err instanceof Error ? err.message : String(err)
    )
    let userError = 'Report generation failed. Please try again.'
    if (err instanceof Anthropic.RateLimitError)
      userError = 'We are experiencing high demand. Please try again in a moment.'
    else if (
      err instanceof Anthropic.APIError &&
      err.status === 400 &&
      err.message.includes('credit balance')
    )
      userError = 'Service temporarily unavailable. Please try again later.'
    return NextResponse.json({ error: userError }, { status: 502 })
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
    totalCount: report.candidates.length,
  })
}
