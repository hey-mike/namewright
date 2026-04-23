import * as Sentry from '@sentry/nextjs'

// Server-side Sentry init. Loaded by src/instrumentation.ts only when
// SENTRY_DSN is set, so this file is effectively dead code in environments
// without Sentry credentials.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Lower default in prod — naming research is bursty and full-trace would
  // exceed the free tier quickly. Override per-deployment via env.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  // Captures structured logs (Pino warn/error) as Sentry breadcrumbs/events.
  enableLogs: true,
  // PII is mostly absent (no user accounts) — safe to send what little is there.
  sendDefaultPii: true,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
})
