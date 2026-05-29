import 'server-only'
import Stripe from 'stripe'

// Server-only Stripe client. Reads the secret key from the environment
// (STRIPE_SECRET_KEY) — sk_test_... while testing, sk_live_... at go-live.
// Importing this from a client component throws at build time (server-only).
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  _stripe = new Stripe(key)
  return _stripe
}
