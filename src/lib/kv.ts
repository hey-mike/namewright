import { kv } from '@vercel/kv'
import logger from './logger'
import type { ReportData } from './types'
import { validateReportData } from './anthropic'

const TTL_SECONDS = 604800 // 7 days — long enough for sleep-on-it / share-with-cofounder before commit

export async function saveReport(reportId: string, report: ReportData): Promise<void> {
  const key = `report:${reportId}`
  const createdAt = new Date().toISOString()
  await kv.set(key, report, { ex: TTL_SECONDS })
  // Audit log lets ops distinguish TTL expiry from write failure when a
  // webhook later reports "report not found": compare createdAt + TTL_SECONDS
  // against the webhook arrival time.
  logger.info(
    { key, reportId, ttlSeconds: TTL_SECONDS, createdAt, event: 'kv_save' },
    'report saved to KV'
  )
}

export async function getReport(reportId: string): Promise<ReportData | null> {
  const raw = await kv.get<unknown>(`report:${reportId}`)
  if (raw == null) return null
  try {
    return validateReportData(raw)
  } catch (err) {
    logger.warn(
      { reportId, err: err instanceof Error ? err.message : String(err) },
      'KV report failed validation — likely schema drift, returning null'
    )
    return null
  }
}

// Nonce is single-use (atomic getdel below) — 24h is plenty for the
// post-checkout redirect window. Deliberately shorter than report TTL.
const NONCE_TTL_SECONDS = 24 * 60 * 60

export async function setAuthNonce(stripeSessionId: string, nonce: string): Promise<void> {
  await kv.set(`auth-nonce:${stripeSessionId}`, nonce, { ex: NONCE_TTL_SECONDS })
}

// Returns true if the nonce matched and was consumed; false if missing or mismatched.
// Atomic via DEL (kv.getdel) so a nonce can only be consumed once.
export async function consumeAuthNonce(
  stripeSessionId: string,
  providedNonce: string
): Promise<boolean> {
  const stored = await kv.getdel<string>(`auth-nonce:${stripeSessionId}`)
  return stored !== null && stored === providedNonce
}
