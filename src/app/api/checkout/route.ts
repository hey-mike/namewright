import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { validateEnv } from '@/lib/env'

export async function POST(req: Request) {
  validateEnv()
  let reportId: unknown
  try {
    ;({ reportId } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof reportId !== 'string' || !UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

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
      metadata: { reportId },
      success_url: `${appUrl}/api/auth?report_id=${reportId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/preview?report_id=${reportId}`,
    })
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error('[checkout] Stripe error:', err.message)
      return NextResponse.json(
        { error: 'Payment setup failed. Please try again.' },
        { status: 502 }
      )
    }
    throw err
  }

  return NextResponse.json({ url: session.url })
}
