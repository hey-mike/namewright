import Stripe from 'stripe'

let _stripe: Stripe | null = null

export default function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY env var is required')
    _stripe = new Stripe(key, {
      apiVersion: '2026-03-25.dahlia',
    })
  }
  return _stripe
}
