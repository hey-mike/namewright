import logger from './logger'
import { notifySlack } from './alerts'
import { officesForGeography } from './geography'
import type { TrademarkCheckResult, TrademarkConflict } from './signa'

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
// Debounce Slack alerts so we don't spam the channel when EUIPO auth is down
// — one alert per cold boot is enough to page on-call.
let _tokenAlertSentAt = 0
const TOKEN_ALERT_DEBOUNCE_MS = 60 * 60 * 1000 // 1h

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
        const err = new Error(`EUIPO token request failed: ${res.status}`) as Error & {
          status: number
          upstream: 'euipo'
          phase: 'token'
        }
        err.status = res.status
        err.upstream = 'euipo'
        err.phase = 'token'
        throw err
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

// Shape of one trademark hit from the EUIPO search API. Verified 2026-04-24
// against the sandbox OpenAPI spec at
// https://dev-sandbox.euipo.europa.eu/product/trademark-search_100/api/trademark-search
interface EuipoMark {
  applicationNumber?: string
  status?: string
  niceClasses?: number[]
  wordMarkSpecification?: { verbalElement?: string }
  applicants?: Array<{ name?: string; office?: string }>
  applicationDate?: string
  registrationDate?: string
  expiryDate?: string
  markKind?: string
  markFeature?: string
}

// Spring Data pageable response shape — the `trademarks` array holds hits.
interface EuipoSearchResponse {
  trademarks?: EuipoMark[]
  totalElements?: number
  page?: number
  size?: number
  totalPages?: number
}

// EUIPO status values that indicate the mark is still active on the register.
// EXPIRED, REFUSED, WITHDRAWN, CANCELLED etc. don't drive risk.
// Verified values seen in sandbox: ACCEPTED, REGISTERED, EXPIRED, CANCELLATION_PENDING.
const LIVE_STATUSES = new Set([
  'REGISTERED',
  'ACCEPTED',
  'PUBLISHED',
  'OPPOSITION_PENDING',
  'CANCELLATION_PENDING',
])

function isLiveMark(m: EuipoMark): boolean {
  return LIVE_STATUSES.has((m.status ?? '').toUpperCase())
}

async function searchTrademarks(
  cfg: EuipoConfig,
  token: string,
  query: string,
  niceClass: number
): Promise<EuipoSearchResponse> {
  // EUIPO uses RSQL for filtering. verbalElement match appears case-sensitive
  // in sandbox, so upcase the candidate for consistency. niceClasses uses the
  // `=in=` set-membership operator.
  const rsql = `wordMarkSpecification.verbalElement==${query.toUpperCase()} and niceClasses=in=(${niceClass})`
  const params = new URLSearchParams({
    query: rsql,
    page: '0',
    size: '10',
  })
  const url = `${cfg.apiBase}/trademark-search/trademarks?${params}`

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
    const err = new Error(`EUIPO search failed: ${res.status}`) as Error & {
      status: number
      upstream: 'euipo'
      phase: 'search'
    }
    err.status = res.status
    err.upstream = 'euipo'
    err.phase = 'search'
    throw err
  }

  return (await res.json()) as EuipoSearchResponse
}

function scoreFromMarks(marks: EuipoMark[]): TrademarkCheckResult['risk'] {
  const live = marks.filter(isLiveMark)
  if (live.length === 0) return 'low'
  // EUIPO direct doesn't return a relevance score, so fall back to count-based
  // bucketing. The Signa side handles severity weighting; EUIPO acts as a
  // confirming/disconfirming signal.
  if (live.length === 1) return 'moderate'
  return 'high'
}

function toConflict(m: EuipoMark): TrademarkConflict {
  return {
    markText: m.wordMarkSpecification?.verbalElement ?? '?',
    office: 'euipo',
    jurisdiction: 'EU',
    niceClasses: m.niceClasses ?? [],
    registrationNumber: m.applicationNumber,
    filingDate: m.applicationDate,
    ownerName: m.applicants?.[0]?.name,
    isLive: isLiveMark(m),
    relevanceScore: 0, // EUIPO direct does not expose a relevance score
  }
}

function buildNotes(query: string, conflicts: TrademarkConflict[]): string {
  if (conflicts.length === 0) {
    return `No EUIPO conflicts found for "${query}".`
  }
  const cited = conflicts.slice(0, 3).map((c) => {
    const parts = [c.markText]
    if (c.registrationNumber) parts.push(`reg ${c.registrationNumber}`)
    if (c.filingDate) parts.push(`filed ${c.filingDate.slice(0, 10)}`)
    return parts.join(', ')
  })
  const overflow = conflicts.length > 3 ? ` (+${conflicts.length - 3} more)` : ''
  return `EUIPO conflicts: ${cited.join('; ')}${overflow}.`
}

const EUIPO_UNAVAILABLE: TrademarkCheckResult = {
  candidateName: '',
  risk: 'uncertain',
  notes: 'EUIPO search unavailable.',
  sources: [],
  conflicts: [],
}

export function shouldQueryEuipo(geography: string): boolean {
  return officesForGeography(geography).includes('euipo')
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
    const marks = response.trademarks ?? []
    const conflicts = marks.map(toConflict)
    return {
      candidateName,
      risk: scoreFromMarks(marks),
      notes: buildNotes(candidateName, conflicts),
      sources: ['EUIPO direct'],
      conflicts,
    }
  } catch (err) {
    const e = (err ?? {}) as { status?: number; phase?: 'token' | 'search' }
    logger.warn(
      {
        candidateName,
        upstream: 'euipo',
        status: e.status,
        phase: e.phase,
        err: err instanceof Error ? err.message : String(err),
      },
      'EUIPO trademark check failed — degrading to uncertain'
    )
    // Token fetch failures mean the whole EUIPO integration is down, not a
    // per-candidate miss — page on-call (debounced to avoid spam).
    if (e.phase === 'token') {
      const now = Date.now()
      if (now - _tokenAlertSentAt > TOKEN_ALERT_DEBOUNCE_MS) {
        _tokenAlertSentAt = now
        await notifySlack({
          severity: 'warning',
          title: 'EUIPO OAuth token fetch failing',
          details: {
            status: e.status,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      }
    }
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
  _tokenAlertSentAt = 0 // reset Slack-alert debounce so each test starts fresh
}
