import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { generateReport, getErrorStage } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { validateEnv } from '@/lib/env'
import { notifySlack } from '@/lib/alerts'
import logger from '@/lib/logger'
import {
  SUPPORTED_TLDS,
  DEFAULT_TLDS,
  PERSONALITY_VALUES,
  GEOGRAPHY_VALUES,
  type Personality,
  type Geography,
} from '@/lib/types'
import type { GenerateRequest } from '@/lib/types'

export async function POST(req: Request) {
  validateEnv()
  const requestId = randomUUID()
  const startedAt = Date.now()
  const log = logger.child({ requestId, route: 'generate' })

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
  if (!(PERSONALITY_VALUES as readonly string[]).includes(body.personality)) {
    return NextResponse.json(
      { error: `Invalid personality. Must be one of: ${PERSONALITY_VALUES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!(GEOGRAPHY_VALUES as readonly string[]).includes(body.geography)) {
    return NextResponse.json(
      { error: `Invalid geography. Must be one of: ${GEOGRAPHY_VALUES.join(', ')}` },
      { status: 400 }
    )
  }
  if (body.constraints && body.constraints.length > 500) {
    return NextResponse.json(
      { error: 'constraints must be 500 characters or fewer' },
      { status: 400 }
    )
  }

  const tlds = Array.isArray(body.tlds) && body.tlds.length > 0 ? body.tlds : DEFAULT_TLDS
  if (tlds.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 domain extensions allowed' }, { status: 400 })
  }
  const invalidTld = tlds.find(
    (t) => !SUPPORTED_TLDS.includes(t as (typeof SUPPORTED_TLDS)[number])
  )
  if (invalidTld) {
    return NextResponse.json(
      { error: `Unsupported domain extension: .${invalidTld}` },
      { status: 400 }
    )
  }

  log.info('report generation started')

  let report
  try {
    report = await generateReport(
      {
        description: body.description,
        personality: body.personality as Personality,
        geography: body.geography as Geography,
        constraints: body.constraints,
        tlds,
      },
      { requestId }
    )
  } catch (err) {
    let userError = 'Report generation failed. Please try again.'
    const stage = getErrorStage(err)
    const durationMs = Date.now() - startedAt
    if (err instanceof Anthropic.RateLimitError) {
      log.warn({ err: err.message, stage, durationMs }, 'rate limited by Anthropic')
      userError = 'We are experiencing high demand. Please try again in a moment.'
    } else if (
      err instanceof Anthropic.APIError &&
      err.status === 400 &&
      err.message.includes('credit balance')
    ) {
      log.error({ err: err.message, stage, durationMs }, 'Anthropic credit balance exhausted')
      await notifySlack({
        severity: 'critical',
        title: 'Anthropic credit balance exhausted',
        details: { error: err.message, stage },
        requestId,
      })
      userError = 'Service temporarily unavailable. Please try again later.'
    } else {
      log.error(
        { err: err instanceof Error ? err.message : String(err), stage, durationMs },
        'report generation failed'
      )
    }
    return NextResponse.json({ error: userError }, { status: 502 })
  }

  const reportId = randomUUID()

  try {
    await saveReport(reportId, report)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error({ err: errMsg }, 'KV save failed')
    // KV is the only persistence layer for reports — a save failure means the
    // user can't be served the report they just paid for (or are about to).
    await notifySlack({
      severity: 'critical',
      title: 'KV save failed for generated report',
      details: { reportId, error: errMsg },
      requestId,
    })
    return NextResponse.json({ error: 'Failed to save report. Please try again.' }, { status: 503 })
  }

  log.info(
    {
      reportId,
      candidateCount: report.candidates.length,
      durationMs: Date.now() - startedAt,
      event: 'request_completed',
    },
    'report generation completed'
  )

  return NextResponse.json({
    reportId,
    preview: report.candidates.slice(0, 3),
    summary: report.summary,
    totalCount: report.candidates.length,
  })
}
