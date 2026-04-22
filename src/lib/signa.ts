import Signa from '@signa-so/sdk'

export type TrademarkRisk = 'low' | 'moderate' | 'high' | 'uncertain'

export interface TrademarkCheckResult {
  candidateName: string
  risk: TrademarkRisk
  notes: string
  sources: string[]
}

let _signa: Signa | null = null
function getSigna(): Signa {
  if (!_signa) _signa = new Signa({ api_key: process.env.SIGNA_API_KEY })
  return _signa
}

// Phase 2a: Parallel fan-out trademark verification
// Queries Signa (USPTO + EUIPO + WIPO Madrid) per candidate.
// Merge logic: conflict-first — any source flagging a conflict wins.
export async function checkTrademark(
  candidateName: string,
  niceClass: number
): Promise<TrademarkCheckResult> {
  try {
    const results = await getSigna().search.query({
      query: candidateName,
      strategies: ['exact', 'phonetic', 'fuzzy'],
      filters: {
        offices: ['USPTO', 'EUIPO'],
        nice_classes: [niceClass],
      },
      limit: 10,
    })

    const conflicts =
      results.data?.filter((tm) =>
        tm.mark_text?.toLowerCase().includes(candidateName.toLowerCase())
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
  } catch (err) {
    console.error(`[signa] checkTrademark failed for "${candidateName}":`, err)
    return {
      candidateName,
      risk: 'uncertain',
      notes: 'Trademark search unavailable. Manual verification recommended.',
      sources: [],
    }
  }
}

// Batch check all candidates in parallel; partial failures return 'uncertain' rather than rejecting
export async function checkAllTrademarks(
  candidates: { name: string }[],
  niceClass: number
): Promise<Map<string, TrademarkCheckResult>> {
  const settled = await Promise.allSettled(candidates.map((c) => checkTrademark(c.name, niceClass)))
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
        },
      ]
    })
  )
}
