import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { validateEnv } from '@/lib/env'
import { inngest } from '@/inngest/client'
import { setJobStatus } from '@/lib/kv'
import logger from '@/lib/logger'
import {
  SUPPORTED_TLDS,
  DEFAULT_TLDS,
  PERSONALITY_VALUES,
  GEOGRAPHY_VALUES,
  NAME_TYPE_VALUES,
  type Personality,
  type Geography,
  type NameType,
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
    log.warn({ event: 'validation_failed', reason: 'invalid_json' }, 'request rejected')
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.description || !body.personality || !body.geography) {
    log.warn({ event: 'validation_failed', reason: 'missing_required' }, 'request rejected')
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (body.description.length > 1000) {
    log.warn({ event: 'validation_failed', reason: 'description_too_long' }, 'request rejected')
    return NextResponse.json(
      { error: 'description must be 1000 characters or fewer' },
      { status: 400 }
    )
  }
  if (body.personality.length > 100) {
    log.warn({ event: 'validation_failed', reason: 'personality_too_long' }, 'request rejected')
    return NextResponse.json(
      { error: 'personality must be 100 characters or fewer' },
      { status: 400 }
    )
  }
  if (body.geography.length > 100) {
    log.warn({ event: 'validation_failed', reason: 'geography_too_long' }, 'request rejected')
    return NextResponse.json(
      { error: 'geography must be 100 characters or fewer' },
      { status: 400 }
    )
  }
  if (!(PERSONALITY_VALUES as readonly string[]).includes(body.personality)) {
    log.warn(
      { event: 'validation_failed', reason: 'personality_not_in_allowlist' },
      'request rejected'
    )
    return NextResponse.json(
      { error: `Invalid personality. Must be one of: ${PERSONALITY_VALUES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!(GEOGRAPHY_VALUES as readonly string[]).includes(body.geography)) {
    log.warn(
      { event: 'validation_failed', reason: 'geography_not_in_allowlist' },
      'request rejected'
    )
    return NextResponse.json(
      { error: `Invalid geography. Must be one of: ${GEOGRAPHY_VALUES.join(', ')}` },
      { status: 400 }
    )
  }
  // nameType — defaults to 'company' for clients sending pre-nameType payloads
  // (e.g. older clients or external API consumers). Explicit invalid values
  // still 400. Validate against the allowlist before narrowing the type, to
  // mirror the personality / geography pattern above.
  const nameTypeRaw = body.nameType ?? 'company'
  if (!(NAME_TYPE_VALUES as readonly string[]).includes(nameTypeRaw)) {
    log.warn(
      { event: 'validation_failed', reason: 'nametype_not_in_allowlist' },
      'request rejected'
    )
    return NextResponse.json(
      { error: `Invalid nameType. Must be one of: ${NAME_TYPE_VALUES.join(', ')}` },
      { status: 400 }
    )
  }
  const nameType = nameTypeRaw as NameType
  if (body.constraints && body.constraints.length > 500) {
    log.warn({ event: 'validation_failed', reason: 'constraints_too_long' }, 'request rejected')
    return NextResponse.json(
      { error: 'constraints must be 500 characters or fewer' },
      { status: 400 }
    )
  }

  const tlds = Array.isArray(body.tlds) && body.tlds.length > 0 ? body.tlds : DEFAULT_TLDS
  if (tlds.length > 5) {
    log.warn({ event: 'validation_failed', reason: 'too_many_tlds' }, 'request rejected')
    return NextResponse.json({ error: 'Maximum 5 domain extensions allowed' }, { status: 400 })
  }
  const invalidTld = tlds.find(
    (t) => !SUPPORTED_TLDS.includes(t as (typeof SUPPORTED_TLDS)[number])
  )
  if (invalidTld) {
    log.warn(
      { event: 'validation_failed', reason: 'tld_not_supported', tld: invalidTld },
      'request rejected'
    )
    return NextResponse.json(
      { error: `Unsupported domain extension: .${invalidTld}` },
      { status: 400 }
    )
  }

  // Dev-only header — lets the IntakeForm toggle override DEV_MOCK_PIPELINE
  // per-request. Production hard-refuses this header inside generateReport
  // (VERCEL_ENV=production check), so it can never affect paying users.
  const devMockHeader = req.headers.get('x-dev-mock-pipeline')
  const mockPipeline = devMockHeader === '1' ? true : devMockHeader === '0' ? false : undefined

  log.info('report generation started')

  const jobId = randomUUID()
  const reportId = randomUUID()

  try {
    // Initial status set in Redis so the frontend can immediately start polling
    await setJobStatus(jobId, { status: 'pending' })

    await inngest.send({
      name: 'report.generate',
      data: {
        body: {
          description: body.description,
          personality: body.personality as Personality,
          geography: body.geography as Geography,
          constraints: body.constraints,
          tlds,
          nameType,
        },
        requestId,
        jobId,
        reportId,
        mockPipeline,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error({ err: errMsg }, 'Inngest job dispatch failed')
    return NextResponse.json(
      { error: 'Failed to start generation. Please try again.' },
      { status: 503 }
    )
  }

  log.info(
    {
      jobId,
      reportId,
      durationMs: Date.now() - startedAt,
      event: 'request_completed',
    },
    'report generation job dispatched'
  )

  return NextResponse.json({
    jobId,
    reportId,
  })
}
