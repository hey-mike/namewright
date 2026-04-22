import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

const ipRequestCounts = new Map<string, { count: number; windowStart: number }>()

export function proxy(request: NextRequest) {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'

  const now = Date.now()
  const entry = ipRequestCounts.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequestCounts.set(ip, { count: 1, windowStart: now })
    return NextResponse.next()
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)),
      },
    })
  }

  entry.count++
  return NextResponse.next()
}

export const config = {
  matcher: '/api/generate',
}
