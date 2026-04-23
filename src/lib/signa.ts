import Signa, { type SearchV2Result } from '@signa-so/sdk'
import { officesForGeography } from './geography'
import logger from './logger'

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

let _signa: Signa | null = null
function getSigna(): Signa {
  const key = process.env.SIGNA_API_KEY
  if (!key) throw new Error('SIGNA_API_KEY is not set')
  if (!_signa) _signa = new Signa({ api_key: key })
  return _signa
}

export const TRADEMARK_UNAVAILABLE_NOTES =
  'Trademark search unavailable. Manual verification recommended.'

// Severity buckets a single live result. Signa's relevance_score is calibrated
// 0-100 — empirically anything ≥80 is a near-collision, 50-80 is a meaningful
// signal worth flagging, below 50 is noise.
function bucketResult(r: SearchV2Result): TrademarkRisk {
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
export function scoreFromResults(results: SearchV2Result[]): TrademarkRisk {
  const liveBuckets = results.filter((r) => r.status?.primary === 'active').map(bucketResult)
  if (liveBuckets.length === 0) return 'low'
  return liveBuckets.reduce<TrademarkRisk>(
    (worst, current) => (RISK_RANK[current] > RISK_RANK[worst] ? current : worst),
    'low'
  )
}

function toConflict(r: SearchV2Result): TrademarkConflict {
  // SearchV2Result is the lightweight search hit shape — registration_number
  // and other detail fields require a follow-up trademarks.retrieve(id) call.
  // For now we surface what the search returns; deepening per-hit details is
  // a future enhancement gated on cost (extra API call per conflict).
  return {
    markText: r.mark_text ?? '?',
    office: r.office_code,
    jurisdiction: r.jurisdiction_code,
    niceClasses: r.nice_classes,
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
    parts.push(`Class ${c.niceClasses.join('/')}`, c.office.toUpperCase())
    return parts.join(', ')
  })
  const overflow = live.length > 3 ? ` (+${live.length - 3} more)` : ''
  return `Active conflicts: ${cited.join('; ')}${overflow}.`
}

export async function checkTrademark(
  candidateName: string,
  niceClass: number,
  geography: string
): Promise<TrademarkCheckResult> {
  const offices = officesForGeography(geography)
  try {
    // search.query() calls POST /v1/trademarks/search (deprecated, sunset 2026-10-01).
    // Migrate to signa.trademarks.list({ q }) once the SDK exposes `q` in TrademarkListParams.
    const results = await getSigna().search.query({
      query: candidateName,
      strategies: ['exact', 'phonetic', 'fuzzy'],
      filters: {
        offices,
        nice_classes: [niceClass],
      },
      limit: 10,
    })

    const data = results.data ?? []
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
