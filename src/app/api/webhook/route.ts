import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { validateEnv } from '@/lib/env'
import { notifySlack } from '@/lib/alerts'
import { getReport } from '@/lib/kv'
import { sendReportEmail } from '@/lib/email'
import logger from '@/lib/logger'

export async function POST(req: Request) {
  validateEnv()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
    event = stripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    // Signature failures could mean misconfiguration or active tampering;
    // either way someone needs to look at it.
    await notifySlack({
      severity: 'critical',
      title: 'Stripe webhook signature verification failed',
      details: { error: message },
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const reportId = session.metadata?.reportId
    if (!reportId) {
      logger.error({ route: 'webhook' }, 'Missing reportId in session metadata')
      // A paid session without a reportId is a data loss event — the customer
      // paid but cannot reach their report.
      await notifySlack({
        severity: 'critical',
        title: 'Paid Stripe session missing reportId metadata',
        details: { sessionId: session.id, customerEmail: session.customer_email },
      })
      return NextResponse.json({ received: true })
    }

    // Send the email-me-a-copy if the user opted in at the paywall. Empty
    // string in metadata = explicit opt-out (no email entered). Failures
    // here must NOT 5xx the webhook — Stripe will retry which would queue
    // duplicate sends. Log + Slack-alert and acknowledge instead.
    const reportEmail = session.metadata?.reportEmail
    if (reportEmail) {
      const report = await getReport(reportId)
      if (!report) {
        logger.warn(
          { route: 'webhook', reportId, sessionId: session.id },
          'Report not found in KV when sending email — likely TTL race or write failure'
        )
        await notifySlack({
          severity: 'critical',
          title: 'Email opt-in failed: report missing from KV',
          details: { reportId, sessionId: session.id, reportEmail },
        })
      } else {
        const result = await sendReportEmail({ to: reportEmail, reportId, report })
        if (!result.ok) {
          logger.warn(
            { route: 'webhook', reportId, reason: result.reason },
            'Report email send failed'
          )
          await notifySlack({
            severity: 'warning',
            title: 'Report email send failed',
            details: { reportId, sessionId: session.id, reason: result.reason },
          })
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
