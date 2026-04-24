import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { validateEnv } from '@/lib/env'
import { setAuthNonce } from '@/lib/kv'
import logger from '@/lib/logger'

// Light server-side email check. Stripe's own validation runs again at
// checkout time; we just want to reject obvious garbage before storing it
// in session metadata.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  validateEnv()
  let body: { reportId?: unknown; reportEmail?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const reportId = body.reportId
  const rawEmail = body.reportEmail

  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof reportId !== 'string' || !UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 })
  }

  // Email is optional. Reject any non-string/non-null value so we don't put
  // arbitrary data into metadata. Empty/null = no email send on payment.
  let reportEmail: string | null = null
  if (rawEmail !== undefined && rawEmail !== null && rawEmail !== '') {
    if (typeof rawEmail !== 'string' || rawEmail.length > 254 || !EMAIL_RE.test(rawEmail.trim())) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    reportEmail = rawEmail.trim().toLowerCase()
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  // Stripe metadata values must be strings. Use empty string as the absent
  // sentinel so the webhook can detect "no email requested" without an extra
  // shape variant.
  const metadata: Record<string, string> = { reportId, reportEmail: reportEmail ?? '' }

  // CSRF guard: bind the cookie-setting GET /api/auth call to a server-issued
  // single-use nonce, so an attacker can't craft a top-level navigation that
  // sets the victim's session cookie to a Stripe session they control.
  const nonce = randomUUID()

  let session
  try {
    session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 1900,
            product_data: {
              name: 'Brand Name Research Report',
              description:
                '8–12 ranked brand name candidates with trademark risk assessment and domain availability',
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      // Pre-fill Stripe's own email field so the user doesn't retype.
      ...(reportEmail ? { customer_email: reportEmail } : {}),
      success_url: `${appUrl}/api/auth?report_id=${reportId}&session_id={CHECKOUT_SESSION_ID}&nonce=${nonce}`,
      cancel_url: `${appUrl}/preview?report_id=${reportId}`,
    })
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      logger.error({ route: 'checkout', err: err.message }, 'Stripe session create failed')
      return NextResponse.json(
        { error: 'Payment setup failed. Please try again.' },
        { status: 502 }
      )
    }
    throw err
  }

  await setAuthNonce(session.id, nonce)

  return NextResponse.json({ url: session.url })
}
