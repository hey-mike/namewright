jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
  })),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))

import stripe from '@/lib/stripe'
import { POST } from '@/app/api/webhook/route'

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

function makeRequest() {
  return new Request('http://localhost/api/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: JSON.stringify({}),
  })
}

function mockConstructEvent(returnValue: object) {
  ;(stripe as jest.Mock).mockReturnValue({
    webhooks: { constructEvent: jest.fn().mockReturnValue(returnValue) },
  })
}

function mockConstructEventThrow() {
  ;(stripe as jest.Mock).mockReturnValue({
    webhooks: {
      constructEvent: jest.fn().mockImplementation(() => {
        throw new Error('Invalid signature')
      }),
    },
  })
}

describe('POST /api/webhook', () => {
  it('returns { received: true } with no cookie on checkout.session.completed', async () => {
    mockConstructEvent({
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'paid', metadata: { reportId: 'report-abc' } } },
    })

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('ignores unpaid sessions', async () => {
    mockConstructEvent({
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'unpaid', metadata: { reportId: 'report-abc' } } },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 200 when reportId is missing in metadata', async () => {
    mockConstructEvent({
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'paid', metadata: {} } },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('returns 400 on invalid signature', async () => {
    mockConstructEventThrow()

    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns { received: true } for unrelated event types', async () => {
    mockConstructEvent({
      type: 'payment_intent.created',
      data: { object: {} },
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
