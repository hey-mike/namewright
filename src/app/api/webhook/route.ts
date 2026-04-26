import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { validateEnv } from '@/lib/env'
import { notifySlack } from '@/lib/alerts'
import { getReport } from '@/lib/r2'
import { sendReportEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  validateEnv()
  const requestId = randomUUID()
  const log = logger.child({ requestId, route: 'webhook' })
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
    if (!sig) throw new Error('Missing stripe-signature header')
    event = stripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    // Signature failures could mean misconfiguration or active tampering;
    // either way someone needs to look at it.
    log.error({ err: message, hasSignature: !!sig }, 'Stripe webhook signature verification failed')
    await notifySlack({
      severity: 'critical',
      title: 'Stripe webhook signature verification failed',
      details: { error: message, hasSignature: !!sig },
      requestId,
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }

  log.info({ stripeEventId: event.id, eventType: event.type }, 'webhook event received')

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const reportId = session.metadata?.reportId
    if (!reportId) {
      log.error(
        { stripeEventId: event.id, sessionId: session.id },
        'Missing reportId in session metadata'
      )
      // A paid session without a reportId is a data loss event — the customer
      // paid but cannot reach their report.
      await notifySlack({
        severity: 'critical',
        title: 'Paid Stripe session missing reportId metadata',
        details: {
          stripeEventId: event.id,
          sessionId: session.id,
          customerEmail: session.customer_email,
        },
        requestId,
      })
      return NextResponse.json({ received: true })
    }

    // Send the email-me-a-copy if the user opted in at the paywall. Empty
    // string in metadata = explicit opt-out (no email entered). Failures
    // here must NOT 5xx the webhook — Stripe will retry which would queue
    // duplicate sends. Log + Slack-alert and acknowledge instead.
    const reportEmail = session.metadata?.reportEmail
    let emailSent = false
    let emailReason: string | undefined
    if (reportEmail) {
      const report = await getReport(reportId)
      if (!report) {
        log.warn(
          { stripeEventId: event.id, sessionId: session.id, reportId },
          'Report not found in KV when sending email — likely TTL race or write failure'
        )
        await notifySlack({
          severity: 'critical',
          title: 'Email opt-in failed: report missing from KV',
          details: { stripeEventId: event.id, sessionId: session.id, reportId, reportEmail },
          requestId,
        })
        emailReason = 'report-missing-from-kv'
      } else {
        const result = await sendReportEmail({ to: reportEmail, reportId, report })
        if (result.ok) {
          emailSent = true
        } else {
          log.warn(
            { stripeEventId: event.id, sessionId: session.id, reportId, reason: result.reason },
            'Report email send failed'
          )
          await notifySlack({
            severity: 'warning',
            title: 'Report email send failed',
            details: {
              stripeEventId: event.id,
              sessionId: session.id,
              reportId,
              reason: result.reason,
            },
            requestId,
          })
          emailReason = result.reason
        }
      }

      // Upsert User and map the ReportRecord in the database
      try {
        await prisma.user.upsert({
          where: { email: reportEmail.toLowerCase() },
          update: {
            reports: {
              create: { id: reportId },
            },
          },
          create: {
            email: reportEmail.toLowerCase(),
            reports: {
              create: { id: reportId },
            },
          },
        })
        log.info({ reportEmail, reportId }, 'Successfully mapped report to user in DB')
      } catch (dbErr) {
        log.error(
          { err: dbErr instanceof Error ? dbErr.message : String(dbErr), reportId, reportEmail },
          'Failed to map report to user in DB'
        )
      }
    }

    // Audit trail so support can reconstruct `stripe session → reportId` from
    // a customer-supplied receipt alone (grep by sessionId or stripeEventId).
    log.info(
      {
        stripeEventId: event.id,
        sessionId: session.id,
        reportId,
        reportEmail: reportEmail || null,
        emailSent,
        emailReason: emailReason ?? null,
      },
      'paid session processed'
    )
  }

  return NextResponse.json({ received: true })
}
