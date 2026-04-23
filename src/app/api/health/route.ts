import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import logger from '@/lib/logger'

// Lightweight health endpoint for external uptime monitors (Better Uptime,
// UptimeRobot, etc.). Pings KV with a short timeout and reports which env
// vars are present without exposing their values. Returns 200 unless KV
// itself is down — env-var gaps are surfaced in the body but don't fail
// the check, since the runtime can boot without all integrations.

const REQUIRED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'SESSION_SECRET',
  'NEXT_PUBLIC_APP_URL',
] as const

const OPTIONAL_ENV_VARS = [
  'SIGNA_API_KEY',
  'WHOISJSON_API_KEY',
  'LAUNCHDARKLY_SDK_KEY',
  'EUIPO_CLIENT_ID',
  'SENTRY_DSN',
  'SLACK_ALERT_WEBHOOK_URL',
  'NEXT_PUBLIC_PLAUSIBLE_DOMAIN',
] as const

const KV_PING_TIMEOUT_MS = 1500

async function pingKv(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
  const start = Date.now()
  try {
    await Promise.race([
      kv.set('healthcheck', '1', { ex: 60 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('KV ping timeout')), KV_PING_TIMEOUT_MS)
      ),
    ])
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function envSummary(): { required: Record<string, boolean>; optional: Record<string, boolean> } {
  const required = Object.fromEntries(REQUIRED_ENV_VARS.map((k) => [k, !!process.env[k]]))
  const optional = Object.fromEntries(OPTIONAL_ENV_VARS.map((k) => [k, !!process.env[k]]))
  return { required, optional }
}

export async function GET() {
  const kvResult = await pingKv()
  const env = envSummary()
  const missingRequired = Object.entries(env.required)
    .filter(([, present]) => !present)
    .map(([k]) => k)

  const status = kvResult.ok ? 'ok' : 'degraded'
  const httpStatus = kvResult.ok ? 200 : 503

  if (!kvResult.ok) {
    logger.warn({ kvError: kvResult.error }, 'health check: KV ping failed')
  }

  return NextResponse.json(
    {
      status,
      kv: kvResult,
      env: {
        missingRequired,
        optionalEnabled: Object.entries(env.optional)
          .filter(([, present]) => present)
          .map(([k]) => k),
      },
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus }
  )
}
