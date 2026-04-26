import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import stripe from '@/lib/stripe'
import { signSession, verifySession } from '@/lib/session'
import { validateEnv } from '@/lib/env'
import { consumeAuthNonce } from '@/lib/kv'
import { getReport } from '@/lib/r2'
import logger from '@/lib/logger'

export async function GET(request: NextRequest) {
  validateEnv()
  const log = logger.child({ route: 'auth' })
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const reportId = request.nextUrl.searchParams.get('report_id')
  const nonce = request.nextUrl.searchParams.get('nonce')

  if (!sessionId || !reportId) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // CSRF guard: the nonce is server-issued at checkout creation and
  // single-use. Without it, SameSite=Lax would let a top-level GET set the
  // victim's session cookie to a Stripe session of the attacker's choosing.
  if (!nonce) {
    return NextResponse.json({ error: 'Invalid or expired auth link' }, { status: 403 })
  }

  const nonceOk = await consumeAuthNonce(sessionId, nonce)
  if (!nonceOk) {
    return NextResponse.json({ error: 'Invalid or expired auth link' }, { status: 403 })
  }

  let stripeSession
  try {
    stripeSession = await stripe().checkout.sessions.retrieve(sessionId)
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Stripe session retrieve failed'
    )
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (stripeSession.payment_status !== 'paid' || stripeSession.metadata?.reportId !== reportId) {
    return NextResponse.redirect(new URL(`/preview?report_id=${reportId}`, request.url))
  }

  const report = await getReport(reportId)
  if (!report) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const cookieStore = await cookies()
  const existingToken = cookieStore.get('session')?.value ?? ''
  const existingSession = await verifySession(existingToken)

  const token = await signSession(reportId, true, existingSession?.userId)
  const response = NextResponse.redirect(new URL(`/results?report_id=${reportId}`, request.url))

  response.cookies.set({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  })

  return response
}
