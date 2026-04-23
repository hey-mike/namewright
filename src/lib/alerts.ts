import logger from './logger'

// Posts a critical-failure alert to a Slack incoming webhook. Returns
// silently when SLACK_ALERT_WEBHOOK_URL is unset, so dev environments and
// pre-launch deploys don't need a Slack workspace configured.
//
// Use sparingly — one per genuinely actionable failure (Stripe webhook
// signature invalid, KV write failure, all upstream providers down at once).
// For routine errors, rely on Sentry breadcrumbs + structured logs.

const REQUEST_TIMEOUT_MS = 3_000

export type AlertSeverity = 'critical' | 'warning' | 'info'

interface NotifySlackOpts {
  severity: AlertSeverity
  /** Short single-line summary that lands in the channel preview */
  title: string
  /** Optional extra detail rendered as a Slack code block */
  details?: Record<string, unknown>
  /** Surface the request id so on-call can grep correlated logs */
  requestId?: string
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
}

export async function notifySlack(opts: NotifySlackOpts): Promise<void> {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL
  if (!url) return

  const detailsBlock = opts.details
    ? '\n```' + JSON.stringify(opts.details, null, 2).slice(0, 2000) + '```'
    : ''
  const requestIdLine = opts.requestId ? `\n_requestId: \`${opts.requestId}\`_` : ''
  const text = `${SEVERITY_EMOJI[opts.severity]} *${opts.title}*${requestIdLine}${detailsBlock}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      logger.warn(
        { status: res.status, severity: opts.severity, title: opts.title },
        'Slack alert delivery failed (non-2xx response)'
      )
    }
  } catch (err) {
    // Never throw from an alert path — alerting failures must not break the
    // request that triggered them.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), title: opts.title },
      'Slack alert delivery threw'
    )
  }
}
