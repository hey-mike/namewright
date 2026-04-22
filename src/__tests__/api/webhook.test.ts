jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}))
jest.mock('@/lib/session', () => ({
  signSession: jest.fn(),
}))

import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'
import { POST } from '@/app/api/webhook/route'

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

describe('POST /api/webhook', () => {
  it('sets session cookie on checkout.session.completed', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { metadata: { reportId: 'report-abc' } } },
    })
    ;(signSession as jest.Mock).mockResolvedValue('signed-token')

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('session=signed-token')
    expect(setCookie).toContain('HttpOnly')
  })

  it('returns 400 on invalid signature', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'bad' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('ignores unrelated event types', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} },
    })

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
