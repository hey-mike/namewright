// Next.js instrumentation hook — invoked once per server runtime.
// Conditionally loads Sentry only when SENTRY_DSN is set so the SDK is fully
// dormant in dev and in environments that don't have error tracking wired.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (!process.env.SENTRY_DSN) return
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}

// Captures errors thrown from Server Components, route handlers, and
// middleware. No-op when Sentry is not initialized (DSN unset).
export const onRequestError = Sentry.captureRequestError
