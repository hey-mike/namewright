// CJS-compatible shim for jose (ESM-only) — implements HS256 JWT using Node crypto
import crypto from 'crypto'

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf
  return b.toString('base64url')
}

function parseB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

export class SignJWT {
  private _payload: Record<string, unknown>
  private _header: Record<string, unknown> = { alg: 'HS256' }
  private _iat?: number
  private _exp?: number

  constructor(payload: Record<string, unknown>) {
    this._payload = { ...payload }
  }

  setProtectedHeader(header: Record<string, unknown>) {
    this._header = header
    return this
  }

  setIssuedAt() {
    this._iat = Math.floor(Date.now() / 1000)
    return this
  }

  setExpirationTime(duration: string) {
    const iat = this._iat ?? Math.floor(Date.now() / 1000)
    const match = duration.match(/^(\d+)h$/)
    const hours = match ? parseInt(match[1], 10) : 2
    this._exp = iat + hours * 3600
    return this
  }

  async sign(secret: Uint8Array): Promise<string> {
    const payload = {
      ...this._payload,
      ...(this._iat !== undefined ? { iat: this._iat } : {}),
      ...(this._exp !== undefined ? { exp: this._exp } : {}),
    }
    const header = b64url(JSON.stringify(this._header))
    const body = b64url(JSON.stringify(payload))
    const signingInput = `${header}.${body}`
    const sig = crypto.createHmac('sha256', Buffer.from(secret)).update(signingInput).digest()
    return `${signingInput}.${b64url(sig)}`
  }
}

export async function jwtVerify(
  token: string,
  secret: Uint8Array
): Promise<{ payload: Record<string, unknown> }> {
  if (!token) throw new Error('Invalid token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')
  const [header, body, sig] = parts
  const signingInput = `${header}.${body}`
  const expected = crypto.createHmac('sha256', Buffer.from(secret)).update(signingInput).digest()
  const actual = parseB64url(sig)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('Signature verification failed')
  }
  const payload = JSON.parse(parseB64url(body).toString('utf8')) as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('Token expired')
  }
  return { payload }
}
