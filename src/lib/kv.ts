import { kv } from '@vercel/kv'

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

export async function setMagicLink(token: string, email: string): Promise<void> {
  const key = `magic_link:${token}`
  await kv.set(key, email, { ex: 900 }) // 15 mins
}

export async function consumeMagicLink(token: string): Promise<string | null> {
  const key = `magic_link:${token}`
  const email = await kv.get<string>(key)
  if (!email) return null
  await kv.del(key)
  return email
}

export type JobStatusPayload =
  | { status: 'pending' }
  | {
      status: 'completed'
      reportId: string
      preview: unknown[]
      summary: string
      totalCount: number
    }
  | { status: 'failed'; error: string }

export async function setJobStatus(jobId: string, payload: JobStatusPayload): Promise<void> {
  // Keep the status for 24 hours
  await kv.set(`job:${jobId}`, payload, { ex: 24 * 60 * 60 })
}

export async function getJobStatus(jobId: string): Promise<JobStatusPayload | null> {
  return await kv.get<JobStatusPayload>(`job:${jobId}`)
}
