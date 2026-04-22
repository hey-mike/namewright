import { NextResponse } from 'next/server'
import stripe from '@/lib/stripe'

export async function POST(req: Request) {
  const { reportId } = await req.json()

  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 1900,
          product_data: {
            name: 'Brand Name Research Report',
            description: '8–12 ranked brand name candidates with trademark risk assessment and domain availability',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { reportId },
    success_url: `${appUrl}/results?report_id=${reportId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/preview?report_id=${reportId}`,
  })

  return NextResponse.json({ url: session.url })
}
