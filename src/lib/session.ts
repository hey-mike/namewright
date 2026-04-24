import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from './types'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required')
  if (secret.length < 32)
    throw new Error('SESSION_SECRET must be at least 32 characters (HS256 needs 256-bit key)')
  return new TextEncoder().encode(secret)
}

export async function signSession(reportId: string, paid: boolean): Promise<string> {
  return new SignJWT({ reportId, paid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (
      typeof payload.reportId !== 'string' ||
      typeof payload.paid !== 'boolean' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
