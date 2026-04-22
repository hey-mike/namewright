import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripe'
import { validateEnv } from '@/lib/env'

export async function POST(req: Request) {
  validateEnv()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')

  let event
  try {
    event = stripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const reportId = session.metadata?.reportId
    if (!reportId) {
      console.error('[webhook] Missing reportId in session metadata', session.id)
      return NextResponse.json({ received: true })
    }
  }

  return NextResponse.json({ received: true })
}
