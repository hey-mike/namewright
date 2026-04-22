import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { kv } from '@vercel/kv'

const RATE_LIMIT_WINDOW_S = 60
const RATE_LIMIT_MAX = 5

export async function proxy(request: NextRequest) {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'

  const key = `rl:generate:${ip}`

  try {
    const count = await kv.incr(key)
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW_S)
    }

    if (count > RATE_LIMIT_MAX) {
      const ttl = await kv.ttl(key)
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(ttl, 1)),
        },
      })
    }
  } catch (err) {
    // KV unavailable — fail open so a KV outage doesn't take down the API
    console.error('[proxy] KV rate limit check failed:', err)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/generate',
}
