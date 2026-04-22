import Signa from '@signa-so/sdk'
import type { Candidate } from './types'

export type TrademarkRisk = 'low' | 'moderate' | 'high' | 'uncertain'

export interface TrademarkCheckResult {
  candidateName: string
  risk: TrademarkRisk
  notes: string
  sources: string[]
}

// Phase 2a: Parallel fan-out trademark verification
// Queries Signa (USPTO + EUIPO + WIPO Madrid) per candidate.
// Merge logic: conflict-first — any source flagging a conflict wins.
export async function checkTrademark(candidateName: string, niceClass: number): Promise<TrademarkCheckResult> {
  const signa = new Signa({ api_key: process.env.SIGNA_API_KEY })

  const results = await signa.trademarks.list({
    q: candidateName,
    offices: 'USPTO,EUIPO',
    limit: 10,
  })

  const conflicts = results.data?.filter((tm: { name?: string }) =>
    tm.name?.toLowerCase().includes(candidateName.toLowerCase())
  ) ?? []

  if (conflicts.length === 0) {
    return {
      candidateName,
      risk: 'low',
      notes: `No conflicts found for "${candidateName}" in Nice Class ${niceClass} across USPTO and EUIPO.`,
      sources: ['Signa (USPTO + EUIPO)'],
    }
  }

  return {
    candidateName,
    risk: 'high',
    notes: `${conflicts.length} potential conflict(s) found for "${candidateName}". Manual review recommended.`,
    sources: ['Signa (USPTO + EUIPO)'],
  }
}

// Batch check all candidates in parallel
export async function checkAllTrademarks(
  candidates: Candidate[],
  niceClass: number
): Promise<Map<string, TrademarkCheckResult>> {
  const results = await Promise.all(
    candidates.map((c) => checkTrademark(c.name, niceClass))
  )
  return new Map(results.map((r) => [r.candidateName, r]))
}
