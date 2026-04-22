import { type NextRequest, NextResponse } from 'next/server'
import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'
import { validateEnv } from '@/lib/env'
import { getReport } from '@/lib/kv'

export async function GET(request: NextRequest) {
  validateEnv()
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const reportId = request.nextUrl.searchParams.get('report_id')

  if (!sessionId || !reportId) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  let stripeSession
  try {
    stripeSession = await stripe().checkout.sessions.retrieve(sessionId)
  } catch (err) {
    console.error('[auth] Stripe session retrieve failed:', err)
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (stripeSession.payment_status !== 'paid' || stripeSession.metadata?.reportId !== reportId) {
    return NextResponse.redirect(new URL(`/preview?report_id=${reportId}`, request.url))
  }

  const report = await getReport(reportId)
  if (!report) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const token = await signSession(reportId, true)
  const response = NextResponse.redirect(new URL(`/results?report_id=${reportId}`, request.url))

  response.cookies.set({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400,
  })

  return response
}
