import logger from './logger'
import type { TrademarkCheckResult } from './signa'

// EUIPO OIDC client_credentials flow (per dev.euipo.europa.eu/security):
//   POST <auth-base>/oidc/accessToken
//   form: client_id, client_secret, grant_type=client_credentials, scope=uid
// Then call APIs with:
//   Authorization: Bearer <token>
//   X-IBM-Client-Id: <client_id>
//
// Defaults target the sandbox. Override via env when production access lands.

const DEFAULT_AUTH_BASE = 'https://auth-sandbox.euipo.europa.eu'
const DEFAULT_API_BASE = 'https://api-sandbox.euipo.europa.eu'
const TOKEN_REFRESH_MARGIN_MS = 60_000
const REQUEST_TIMEOUT_MS = 8_000

interface CachedToken {
  accessToken: string
  expiresAt: number
}

let _tokenCache: CachedToken | null = null
let _tokenInFlight: Promise<string> | null = null

interface EuipoConfig {
  clientId: string
  clientSecret: string
  authBase: string
  apiBase: string
}

function readConfig(): EuipoConfig | null {
  const clientId = process.env.EUIPO_CLIENT_ID
  const clientSecret = process.env.EUIPO_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return {
    clientId,
    clientSecret,
    authBase: process.env.EUIPO_AUTH_BASE_URL ?? DEFAULT_AUTH_BASE,
    apiBase: process.env.EUIPO_API_BASE_URL ?? DEFAULT_API_BASE,
  }
}

async function fetchAccessToken(cfg: EuipoConfig): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return _tokenCache.accessToken
  }
  // Coalesce concurrent callers (e.g. 10 parallel candidate checks at cold
  // start) onto a single token request rather than racing the OIDC endpoint.
  if (_tokenInFlight) return _tokenInFlight

  _tokenInFlight = (async () => {
    try {
      const body = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'client_credentials',
        scope: 'uid',
      })

      const res = await fetch(`${cfg.authBase}/oidc/accessToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        throw new Error(`EUIPO token request failed: ${res.status}`)
      }

      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) {
        throw new Error('EUIPO token response missing access_token')
      }

      // expires_in is seconds; default to 5 min if absent so we don't cache forever
      const expiresInMs = (data.expires_in ?? 300) * 1000
      _tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresInMs,
      }
      return data.access_token
    } finally {
      _tokenInFlight = null
    }
  })()

  return _tokenInFlight
}

// Shape of one trademark hit from the EUIPO search API. Field names are based
// on EUIPO's published schema; if the live API returns different names, adjust
// here rather than at call sites.
interface EuipoMark {
  mark_text?: string
  registration_number?: string
  filing_date?: string
  owner?: string
  nice_classes?: number[]
  status?: string
}

interface EuipoSearchResponse {
  data?: EuipoMark[]
  total_count?: number
}

async function searchTrademarks(
  cfg: EuipoConfig,
  token: string,
  query: string,
  niceClass: number
): Promise<EuipoSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    nice_class: String(niceClass),
    limit: '10',
  })
  const url = `${cfg.apiBase}/trademark-search/v1/trademarks?${params}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-IBM-Client-Id': cfg.clientId,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`EUIPO search failed: ${res.status}`)
  }

  return (await res.json()) as EuipoSearchResponse
}

function scoreFromMarks(marks: EuipoMark[]): TrademarkCheckResult['risk'] {
  if (marks.length === 0) return 'low'
  // EUIPO search treats the query against mark_text directly. Any hit at the
  // matching Nice class is at least moderate; multiple hits become high.
  if (marks.length === 1) return 'moderate'
  return 'high'
}

function buildNotes(query: string, marks: EuipoMark[]): string {
  if (marks.length === 0) {
    return `No EUIPO conflicts found for "${query}".`
  }
  const cited = marks.slice(0, 3).map((m) => {
    const parts = [m.mark_text ?? '?']
    if (m.registration_number) parts.push(`reg ${m.registration_number}`)
    if (m.filing_date) parts.push(`filed ${m.filing_date.slice(0, 10)}`)
    return parts.join(', ')
  })
  const overflow = marks.length > 3 ? ` (+${marks.length - 3} more)` : ''
  return `EUIPO conflicts: ${cited.join('; ')}${overflow}.`
}

const EUIPO_UNAVAILABLE: TrademarkCheckResult = {
  candidateName: '',
  risk: 'uncertain',
  notes: 'EUIPO search unavailable.',
  sources: [],
}

export async function checkEuipoTrademark(
  candidateName: string,
  niceClass: number
): Promise<TrademarkCheckResult> {
  const cfg = readConfig()
  if (!cfg) {
    // Flag may be on without creds — return uncertain rather than throw.
    return { ...EUIPO_UNAVAILABLE, candidateName }
  }

  try {
    const token = await fetchAccessToken(cfg)
    const response = await searchTrademarks(cfg, token, candidateName, niceClass)
    const marks = response.data ?? []
    return {
      candidateName,
      risk: scoreFromMarks(marks),
      notes: buildNotes(candidateName, marks),
      sources: ['EUIPO direct'],
    }
  } catch (err) {
    logger.warn(
      { candidateName, err: err instanceof Error ? err.message : String(err) },
      'EUIPO trademark check failed — degrading to uncertain'
    )
    return { ...EUIPO_UNAVAILABLE, candidateName }
  }
}

export async function checkAllEuipoTrademarks(
  candidates: { name: string }[],
  niceClass: number
): Promise<Map<string, TrademarkCheckResult>> {
  const settled = await Promise.allSettled(
    candidates.map((c) => checkEuipoTrademark(c.name, niceClass))
  )
  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') return [result.value.candidateName, result.value]
      return [candidates[i].name, { ...EUIPO_UNAVAILABLE, candidateName: candidates[i].name }]
    })
  )
}

/**
 * Test-only helper. Clears the cached OAuth token so each test starts fresh.
 */
export function _resetEuipoTokenCacheForTesting(): void {
  if (process.env.NODE_ENV !== 'test') return
  _tokenCache = null
  _tokenInFlight = null
}
