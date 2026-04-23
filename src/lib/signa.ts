import { officesForGeography } from './geography'
import logger from './logger'

// Signa SDK (@signa-so/sdk v0.2.2) doesn't expose the `q` param on
// TrademarkListParams yet, and its search.query() calls a now-sunsetted
// endpoint (HTTP 410). Calling POST /v1/trademarks directly with fetch
// until the SDK catches up. The SDK's Authorization header pattern
// (`Bearer <api_key>`) is preserved.

const SIGNA_BASE_URL = 'https://api.signa.so'
const REQUEST_TIMEOUT_MS = 10_000

export type TrademarkRisk = 'low' | 'moderate' | 'high' | 'uncertain'

/** Structured conflict surfaced from a registry hit. */
export interface TrademarkConflict {
  markText: string
  office: string
  jurisdiction: string
  niceClasses: number[]
  registrationNumber?: string
  filingDate?: string
  ownerName?: string
  /** Active vs dead — dead marks are still cited but don't drive risk */
  isLive: boolean
  /** Signa relevance_score 0-100 — higher = closer match */
  relevanceScore: number
}

export interface TrademarkCheckResult {
  candidateName: string
  risk: TrademarkRisk
  notes: string
  sources: string[]
  conflicts: TrademarkConflict[]
}

export const TRADEMARK_UNAVAILABLE_NOTES =
  'Trademark search unavailable. Manual verification recommended.'

// Shape of a single hit from POST /v1/trademarks. Mirrors what the live API
// returns (probed 2026-04-23) — intentionally narrower than the full Signa
// schema since we only consume these fields.
interface SignaSearchResult {
  id: string
  mark_text: string | null
  status: { primary: string; stage: string } | null
  office_code: string
  jurisdiction_code: string
  filing_date: string | null
  registration_number: string | null
  owner_name: string | null
  classifications: Array<{ nice_class: number; goods_services_text: string | null }>
  relevance_score: number
}

interface SignaSearchResponse {
  object: 'list'
  data: SignaSearchResult[]
  has_more: boolean
}

// Severity buckets a single live result. Signa's relevance_score is calibrated
// 0-100 — empirically anything ≥80 is a near-collision, 50-80 is a meaningful
// signal worth flagging, below 50 is noise.
function bucketResult(r: SignaSearchResult): TrademarkRisk {
  if (r.status?.primary !== 'active') return 'uncertain' // dead marks don't drive risk
  if (r.relevance_score >= 80) return 'high'
  if (r.relevance_score >= 50) return 'moderate'
  return 'low'
}

const RISK_RANK: Record<TrademarkRisk, number> = {
  uncertain: -1,
  low: 0,
  moderate: 1,
  high: 2,
}

// Worst-wins across live results. Dead marks contribute nothing to risk.
export function scoreFromResults(results: SignaSearchResult[]): TrademarkRisk {
  const liveBuckets = results.filter((r) => r.status?.primary === 'active').map(bucketResult)
  if (liveBuckets.length === 0) return 'low'
  return liveBuckets.reduce<TrademarkRisk>(
    (worst, current) => (RISK_RANK[current] > RISK_RANK[worst] ? current : worst),
    'low'
  )
}

function toConflict(r: SignaSearchResult): TrademarkConflict {
  return {
    markText: r.mark_text ?? '?',
    office: r.office_code,
    jurisdiction: r.jurisdiction_code,
    niceClasses: (r.classifications ?? []).map((c) => c.nice_class),
    registrationNumber: r.registration_number ?? undefined,
    filingDate: r.filing_date ?? undefined,
    ownerName: r.owner_name ?? undefined,
    isLive: r.status?.primary === 'active',
    relevanceScore: r.relevance_score,
  }
}

function buildNotes(candidateName: string, conflicts: TrademarkConflict[]): string {
  const live = conflicts.filter((c) => c.isLive)
  if (live.length === 0) {
    return `No active conflicts found for "${candidateName}" across queried offices.`
  }
  const cited = live.slice(0, 3).map((c) => {
    const parts = [c.markText]
    if (c.registrationNumber) parts.push(`#${c.registrationNumber}`)
    const classes = c.niceClasses.join('/')
    if (classes) parts.push(`Class ${classes}`)
    parts.push(c.office.toUpperCase())
    return parts.join(', ')
  })
  const overflow = live.length > 3 ? ` (+${live.length - 3} more)` : ''
  return `Active conflicts: ${cited.join('; ')}${overflow}.`
}

async function searchSignaTrademarks(
  apiKey: string,
  query: string,
  niceClass: number,
  offices: string[]
): Promise<SignaSearchResponse> {
  const res = await fetch(`${SIGNA_BASE_URL}/v1/trademarks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      strategies: ['exact', 'phonetic', 'fuzzy'],
      filters: {
        offices,
        nice_classes: [niceClass],
      },
      limit: 10,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(
      `Signa search failed: ${res.status} ${res.statusText} — ${bodyText.slice(0, 200)}`
    )
  }

  return (await res.json()) as SignaSearchResponse
}

export async function checkTrademark(
  candidateName: string,
  niceClass: number,
  geography: string
): Promise<TrademarkCheckResult> {
  const apiKey = process.env.SIGNA_API_KEY
  if (!apiKey) {
    logger.warn({ candidateName }, 'SIGNA_API_KEY not set — trademark search skipped')
    return {
      candidateName,
      risk: 'uncertain',
      notes: TRADEMARK_UNAVAILABLE_NOTES,
      sources: [],
      conflicts: [],
    }
  }

  const offices = officesForGeography(geography)
  try {
    const response = await searchSignaTrademarks(apiKey, candidateName, niceClass, offices)
    const data = response.data ?? []
    const conflicts = data.map(toConflict)
    const risk = scoreFromResults(data)

    return {
      candidateName,
      risk,
      notes: buildNotes(candidateName, conflicts),
      sources: [`Signa (${offices.map((o) => o.toUpperCase()).join(' + ')})`],
      conflicts,
    }
  } catch (err) {
    logger.warn(
      { candidateName, err: err instanceof Error ? err.message : String(err) },
      'trademark check failed — degrading to uncertain'
    )
    return {
      candidateName,
      risk: 'uncertain',
      notes: TRADEMARK_UNAVAILABLE_NOTES,
      sources: [],
      conflicts: [],
    }
  }
}

// Batch check all candidates in parallel; partial failures return 'uncertain' rather than rejecting
export async function checkAllTrademarks(
  candidates: { name: string }[],
  niceClass: number,
  geography: string
): Promise<Map<string, TrademarkCheckResult>> {
  const settled = await Promise.allSettled(
    candidates.map((c) => checkTrademark(c.name, niceClass, geography))
  )
  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') return [result.value.candidateName, result.value]
      const name = candidates[i].name
      return [
        name,
        {
          candidateName: name,
          risk: 'uncertain' as const,
          notes: 'Trademark search unavailable.',
          sources: [],
          conflicts: [],
        },
      ]
    })
  )
}
