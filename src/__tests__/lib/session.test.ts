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

  it('throws when SESSION_SECRET is shorter than 32 characters', async () => {
    const original = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'a'.repeat(31)
    try {
      await expect(signSession('report-123', true)).rejects.toThrow(/at least 32 characters/)
    } finally {
      process.env.SESSION_SECRET = original
    }
  })

  it('accepts a SESSION_SECRET exactly 32 characters long', async () => {
    const original = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'a'.repeat(32)
    try {
      const token = await signSession('report-123', true)
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    } finally {
      process.env.SESSION_SECRET = original
    }
  })
})
