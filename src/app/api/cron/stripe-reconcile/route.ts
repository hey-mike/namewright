import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { kv } from '@vercel/kv'
import { notifySlack } from '@/lib/alerts'
import logger from '@/lib/logger'

// Reconciles Stripe paid sessions against KV reports to catch the
// "webhook never arrived" failure mode (local stripe listen crashed,
// prod webhook misconfigured, endpoint 5xx'd, etc.). Expected to be
// invoked by Vercel Cron every 6h with:
//   - Header `Authorization: Bearer $CRON_SECRET`
//
// Wire up in vercel.ts:
//   crons: [{ path: '/api/cron/stripe-reconcile', schedule: '0 */6 * * *' }]

const LOOKBACK_SECONDS = 24 * 60 * 60
const MAX_SESSIONS = 100

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const fromHeader = auth.replace(/^Bearer\s+/i, '')
  return fromHeader === secret
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestId = randomUUID()
  const log = logger.child({ requestId, route: 'cron/stripe-reconcile' })
  const startedAt = Date.now()
  const since = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS

  let sessions: Stripe.Checkout.Session[] = []
  try {
    const page = await stripe().checkout.sessions.list({
      limit: MAX_SESSIONS,
      created: { gte: since },
    })
    sessions = page.data
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error({ err: errMsg }, 'Stripe sessions.list failed')
    await notifySlack({
      severity: 'warning',
      title: 'Stripe reconciliation job failed to list sessions',
      details: { error: errMsg },
      requestId,
    })
    return NextResponse.json({ error: 'Stripe list failed' }, { status: 502 })
  }

  const paid = sessions.filter((s) => s.payment_status === 'paid' && s.metadata?.reportId)
  const missing: Array<{ sessionId: string; reportId: string; reportEmail: string | null }> = []

  for (const s of paid) {
    const reportId = s.metadata!.reportId as string
    const exists = await kv.get(`report:${reportId}`)
    if (!exists) {
      missing.push({
        sessionId: s.id,
        reportId,
        reportEmail: (s.metadata?.reportEmail as string) || null,
      })
    }
  }

  const durationMs = Date.now() - startedAt
  log.info(
    {
      event: 'cron_reconcile',
      sessionsChecked: paid.length,
      missing: missing.length,
      durationMs,
    },
    'stripe reconciliation completed'
  )

  if (missing.length > 0) {
    // Sessions may be missing from KV because: (a) TTL expired (>24h since
    // generation), (b) webhook was never delivered, or (c) KV write failed.
    // Either way, support needs to know — page with the list.
    await notifySlack({
      severity: 'critical',
      title: `Stripe reconciliation: ${missing.length} paid session(s) missing from KV`,
      details: { missing: missing.slice(0, 10), totalMissing: missing.length },
      requestId,
    })
  }

  return NextResponse.json({
    sessionsChecked: paid.length,
    missing: missing.length,
    durationMs,
  })
}
