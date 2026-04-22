import { NextResponse } from 'next/server'
import stripe from '@/lib/stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event
  try {
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as unknown as {
      id: string
      metadata: { reportId: string }
      payment_status: string
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const reportId = session.metadata.reportId
    if (!reportId) {
      console.error('[webhook] Missing reportId in session metadata', session.id)
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
    }
  }

  return NextResponse.json({ received: true })
}
