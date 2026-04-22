jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))

import stripe from '@/lib/stripe'
import { POST } from '@/app/api/checkout/route'

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

function mockStripeCreate(resolvedValue: object) {
  ;(stripe as jest.Mock).mockReturnValue({
    checkout: { sessions: { create: jest.fn().mockResolvedValue(resolvedValue) } },
  })
}

describe('POST /api/checkout', () => {
  it('creates a Stripe session and returns the URL', async () => {
    mockStripeCreate({ url: 'https://checkout.stripe.com/pay/cs_test_abc' })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/pay/cs_test_abc')
    expect((stripe as jest.Mock)().checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: { reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      })
    )
  })

  it('returns 400 when reportId is missing', async () => {
    mockStripeCreate({ url: 'https://checkout.stripe.com/pay/cs_test_abc' })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 502 when Stripe throws', async () => {
    const Stripe = (await import('stripe')).default
    ;(stripe as jest.Mock).mockReturnValue({
      checkout: {
        sessions: {
          create: jest
            .fn()
            .mockRejectedValue(
              new Stripe.errors.StripeConnectionError({ message: 'Network error' })
            ),
        },
      },
    })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(502)
  })
})
