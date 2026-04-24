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

// Extracts the account ID from a Stripe secret key. Stripe keys have the
// stable format `sk_(test|live)_51{ACCOUNT_SUFFIX}{...}` where the 14-16
// char ACCOUNT_SUFFIX matches the suffix of the account ID `acct_1{SUFFIX}`.
// This encoding is undocumented but has been stable since 2016+.
//
// Used only for observability — we log this alongside the session ID on
// every checkout so a mismatch between STRIPE_SECRET_KEY's account and
// the local `stripe listen` CLI's authenticated account becomes visible
// in the dev log within seconds, instead of silently hanging until the
// daily stripe-reconcile cron alerts. Catches the class of bug where
// `.env.local` and local CLI auth diverge into different sandbox accounts.
//
// Fragile: if Stripe changes the key format, this falls back to null and
// we just log `stripeAccount: null`. Non-fatal.
function accountIdFromKey(key: string | undefined): string | null {
  if (!key) return null
  // Modern Stripe keys embed a 15-character account suffix after `sk_*_51`.
  // If Stripe changes this format the regex simply fails to match and we
  // log `stripeAccount: null` — diagnostic, not business-critical.
  const m = key.match(/^sk_(?:test|live)_51([A-Za-z0-9]{15})/)
  return m ? `acct_1${m[1]}` : null
}

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

  // Log the Stripe account the session was created under. Derived from the
  // key's encoded account suffix — see accountIdFromKey above for the
  // rationale. Makes a .env.local ↔ `stripe listen` account mismatch
  // (the bug that silently breaks local webhook delivery) obvious on the
  // first checkout: grep the log for `stripeAccount` and compare against
  // the CLI's `stripe config --list` output.
  const stripeAccount = accountIdFromKey(process.env.STRIPE_SECRET_KEY)
  logger.info(
    {
      route: 'checkout',
      sessionId: session.id,
      stripeAccount,
      reportId,
      hasEmail: !!reportEmail,
      event: 'checkout_session_created',
    },
    'Stripe checkout session created'
  )

  return NextResponse.json({ url: session.url })
}
