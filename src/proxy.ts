import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { kv } from '@vercel/kv'
import logger from '@/lib/logger'

type RouteLimit = {
  // KV key prefix; counters are per-route so limits don't share buckets.
  bucket: string
  windowSeconds: number
  max: number
}

// Per-route rate limits. Keep this list small and the matcher in sync below.
const ROUTE_LIMITS: Record<string, RouteLimit> = {
  '/api/generate': { bucket: 'generate', windowSeconds: 60, max: 5 },
  '/api/checkout': { bucket: 'checkout', windowSeconds: 60, max: 10 },
  '/api/preview': { bucket: 'preview', windowSeconds: 60, max: 30 },
}

export async function proxy(request: NextRequest) {
  const limit = ROUTE_LIMITS[request.nextUrl.pathname]
  if (!limit) {
    return NextResponse.next()
  }

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'

  const key = `rl:${limit.bucket}:${ip}`

  try {
    const count = await kv.incr(key)
    // NX: set TTL only if none exists — no-op on normal requests, recovers
    // the window if a previous expire call was lost (process crash, KV blip).
    await kv.expire(key, limit.windowSeconds, 'NX')

    if (count > limit.max) {
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
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'KV rate limit check failed — failing open'
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/generate', '/api/checkout', '/api/preview'],
}
