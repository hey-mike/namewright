jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  },
}))

import stripe from '@/lib/stripe'
import { POST } from '@/app/api/checkout/route'

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

describe('POST /api/checkout', () => {
  it('creates a Stripe session and returns the URL', async () => {
    ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test_abc',
    })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'report-123' }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/pay/cs_test_abc')
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: { reportId: 'report-123' },
      })
    )
  })

  it('returns 400 when reportId is missing', async () => {
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
