import { lookup } from 'dns/promises'
import { TLDS } from './types'
import type { CandidateProposal, DomainAvailability, DomainStatus, Tld } from './types'

async function checkDomain(hostname: string): Promise<DomainStatus> {
  try {
    await lookup(hostname)
    return 'likely taken'
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOTFOUND') return 'likely available'
    return 'uncertain'
  }
}

export async function checkAllDomains(
  candidates: CandidateProposal[]
): Promise<Map<string, DomainAvailability>> {
  const settled = await Promise.allSettled(
    candidates.map(async (c) => {
      const slug = c.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const results = await Promise.all(TLDS.map((tld) => checkDomain(`${slug}.${tld}`)))
      const tldResults = Object.fromEntries(TLDS.map((tld, i) => [tld, results[i]])) as Record<
        Tld,
        DomainStatus
      >
      const availability: DomainAvailability = { ...tldResults, alternates: [] }
      return { name: c.name, availability }
    })
  )

  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return [result.value.name, result.value.availability]
      }
      const fallback: DomainAvailability = {
        ...(Object.fromEntries(TLDS.map((tld) => [tld, 'uncertain' as DomainStatus])) as Record<
          Tld,
          DomainStatus
        >),
        alternates: [],
      }
      return [candidates[i].name, fallback]
    })
  )
}
