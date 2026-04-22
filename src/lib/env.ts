const REQUIRED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'SESSION_SECRET',
  'NEXT_PUBLIC_APP_URL',
] as const

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
