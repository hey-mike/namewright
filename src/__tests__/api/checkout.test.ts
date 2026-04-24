jest.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))
jest.mock('@/lib/kv', () => ({
  setAuthNonce: jest.fn(),
}))

import stripe from '@/lib/stripe'
import { setAuthNonce } from '@/lib/kv'
import { POST } from '@/app/api/checkout/route'

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

function mockStripeCreate(resolvedValue: object) {
  // Always ensure a session id exists — the route uses it as the nonce key.
  ;(stripe as jest.Mock).mockReturnValue({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test_abc', ...resolvedValue }),
      },
    },
  })
}

describe('POST /api/checkout', () => {
  beforeEach(() => {
    ;(setAuthNonce as jest.Mock).mockReset().mockResolvedValue(undefined)
  })

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
        metadata: { reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', reportEmail: '' },
      })
    )
  })

  it('forwards a valid reportEmail into Stripe metadata + customer_email', async () => {
    mockStripeCreate({ url: 'https://checkout.stripe.com/pay/cs_test_def' })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        reportEmail: 'Maya@Example.COM',
      }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect((stripe as jest.Mock)().checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reportEmail: 'maya@example.com' }),
        customer_email: 'maya@example.com',
      })
    )
  })

  it('returns 400 when reportEmail is provided but invalid', async () => {
    mockStripeCreate({ url: 'https://checkout.stripe.com/pay/cs_test_ghi' })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        reportEmail: 'not-an-email',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
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

  it('persists a single-use nonce in KV and embeds it in success_url', async () => {
    mockStripeCreate({ url: 'https://checkout.stripe.com/pay/cs_test_abc' })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const createCall = (stripe as jest.Mock)().checkout.sessions.create.mock.calls[0][0]
    const successUrl: string = createCall.success_url
    const match = successUrl.match(/[?&]nonce=([0-9a-f-]{36})(?:&|$)/)
    expect(match).not.toBeNull()
    const nonce = match![1]

    expect(setAuthNonce).toHaveBeenCalledWith('cs_test_abc', nonce)
    expect(successUrl).toContain('session_id={CHECKOUT_SESSION_ID}')
  })

  it('does not persist a nonce when Stripe session creation fails', async () => {
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
    expect(setAuthNonce).not.toHaveBeenCalled()
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
