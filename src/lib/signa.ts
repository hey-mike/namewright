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
  const key = process.env.SIGNA_API_KEY
  if (!key) throw new Error('SIGNA_API_KEY is not set')
  if (!_signa) _signa = new Signa({ api_key: key })
  return _signa
}

export const TRADEMARK_UNAVAILABLE_NOTES =
  'Trademark search unavailable. Manual verification recommended.'

export function scoreTrademark(resultCount: number): TrademarkRisk {
  if (resultCount === 0) return 'low'
  if (resultCount <= 2) return 'moderate'
  return 'high'
}

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

    const count = results.data?.length ?? 0
    const risk = scoreTrademark(count)

    if (count === 0) {
      return {
        candidateName,
        risk,
        notes: `No conflicts found for "${candidateName}" in Nice Class ${niceClass}.`,
        sources: ['Signa (USPTO + EUIPO)'],
      }
    }

    return {
      candidateName,
      risk,
      notes: `${count} potential conflict(s) found for "${candidateName}". Manual review recommended.`,
      sources: ['Signa (USPTO + EUIPO)'],
    }
  } catch (err) {
    console.error(`[signa] checkTrademark failed for "${candidateName}":`, err)
    return {
      candidateName,
      risk: 'uncertain',
      notes: TRADEMARK_UNAVAILABLE_NOTES,
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
