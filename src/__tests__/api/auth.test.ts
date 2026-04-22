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
}))

import { NextRequest } from 'next/server'
import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'
import { getReport } from '@/lib/kv'
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
  })

  it('sets HttpOnly session cookie and redirects to /results on valid paid session', async () => {
    mockStripeSession()

    const res = await GET(makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123' }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/results?report_id=report-123')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('session=signed-token')
    expect(cookie).toContain('HttpOnly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(signSession).toHaveBeenCalledWith('report-123', true)
  })

  it('redirects to / when session_id or report_id is missing', async () => {
    const res = await GET(makeRequest({ session_id: 'cs_test_abc' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('redirects to /preview when payment_status is not paid', async () => {
    mockStripeSession({ payment_status: 'unpaid' })

    const res = await GET(makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/preview?report_id=report-123')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('redirects to /preview when reportId in metadata does not match query param', async () => {
    mockStripeSession({ metadata: { reportId: 'different-report' } })

    const res = await GET(makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123' }))
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

    const res = await GET(makeRequest({ session_id: 'cs_test_abc', report_id: 'report-123' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
