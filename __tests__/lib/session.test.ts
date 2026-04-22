process.env.SESSION_SECRET = 'a'.repeat(64)

import { signSession, verifySession } from '@/lib/session'

describe('signSession / verifySession', () => {
  it('round-trips a paid session', async () => {
    const token = await signSession('report-123', true)
    const payload = await verifySession(token)
    expect(payload?.reportId).toBe('report-123')
    expect(payload?.paid).toBe(true)
  })

  it('returns null for a tampered token', async () => {
    const token = await signSession('report-123', true)
    const tampered = token.slice(0, -4) + 'xxxx'
    const result = await verifySession(tampered)
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    expect(await verifySession('')).toBeNull()
  })
})
