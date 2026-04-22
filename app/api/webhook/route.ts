import { NextResponse } from 'next/server'
import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata: { reportId: string } }
    const reportId = session.metadata.reportId
    const token = await signSession(reportId, true)

    const res = NextResponse.json({ received: true })
    res.headers.set(
      'set-cookie',
      `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`
    )
    return res
  }

  return NextResponse.json({ received: true })
}
