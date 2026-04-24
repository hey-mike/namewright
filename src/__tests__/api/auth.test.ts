jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('@/lib/session', () => ({
  signSession: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))
jest.mock('@/lib/kv', () => ({
  getReport: jest.fn(),
  consumeAuthNonce: jest.fn(),
}))

import { NextRequest } from 'next/server'
import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'
import { consumeAuthNonce, getReport } from '@/lib/kv'
import { GET } from '@/app/api/auth/route'

const BASE_URL = 'http://localhost:3000'

function makeRequest(params: Record<string, string>) {
  const url = new URL('/api/auth', BASE_URL)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

function mockStripeSession(overrides: object = {}) {
  ;(stripe as jest.Mock).mockReturnValue({
    checkout: {
      sessions: {
        retrieve: jest.fn().mockResolvedValue({
          payment_status: 'paid',
          metadata: { reportId: 'report-123' },
          ...overrides,
        }),
      },
    },
  })
}

describe('GET /api/auth', () => {
  beforeEach(() => {
    ;(signSession as jest.Mock).mockResolvedValue('signed-token')
    ;(getReport as jest.Mock).mockResolvedValue({
      summary: 'mock',
      candidates: [],
      topPicks: [],
      recommendation: '',
    })
    // Default: nonce is valid. Individual tests override for the rejection paths.
    ;(consumeAuthNonce as jest.Mock).mockReset().mockResolvedValue(true)
  })

  it('sets HttpOnly session cookie and redirects to /results on valid paid session', async () => {
    mockStripeSession()

    const res = await GET(
      makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'nonce-xyz' })
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/results?report_id=report-123')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('session=signed-token')
    expect(cookie).toContain('HttpOnly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(signSession).toHaveBeenCalledWith('report-123', true)
    expect(consumeAuthNonce).toHaveBeenCalledWith('cs_test_abc', 'nonce-xyz')
  })

  it('redirects to / when session_id or report_id is missing', async () => {
    const res = await GET(makeRequest({ session_id: 'cs_test_abc' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('returns 403 when nonce query param is missing', async () => {
    mockStripeSession()
    const res = await GET(makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(consumeAuthNonce).not.toHaveBeenCalled()
  })

  it('returns 403 when nonce does not match the stored value', async () => {
    mockStripeSession()
    ;(consumeAuthNonce as jest.Mock).mockResolvedValueOnce(false)

    const res = await GET(
      makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'wrong-nonce' })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 403 the second time the same nonce is presented', async () => {
    mockStripeSession()
    // First call consumes the nonce; second call sees it gone.
    ;(consumeAuthNonce as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const params = { session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'nonce-xyz' }
    const first = await GET(makeRequest(params))
    expect(first.status).toBe(307)

    const second = await GET(makeRequest(params))
    expect(second.status).toBe(403)
    expect(second.headers.get('set-cookie')).toBeNull()
  })

  it('redirects to /preview when payment_status is not paid', async () => {
    mockStripeSession({ payment_status: 'unpaid' })

    const res = await GET(
      makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'nonce-xyz' })
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/preview?report_id=report-123')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('redirects to /preview when reportId in metadata does not match query param', async () => {
    mockStripeSession({ metadata: { reportId: 'different-report' } })

    const res = await GET(
      makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'nonce-xyz' })
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/preview?report_id=report-123')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('redirects to / when Stripe retrieve throws', async () => {
    ;(stripe as jest.Mock).mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockRejectedValue(new Error('Stripe error')),
        },
      },
    })

    const res = await GET(
      makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123', nonce: 'nonce-xyz' })
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
