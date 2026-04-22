import { lookup } from 'dns/promises'
import type { CandidateProposal, DomainAvailability } from './types'

async function checkDomain(
  hostname: string
): Promise<'likely available' | 'likely taken' | 'uncertain'> {
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
      const slug = c.name.toLowerCase().replace(/\s+/g, '')
      const [com, io, co] = await Promise.all([
        checkDomain(`${slug}.com`),
        checkDomain(`${slug}.io`),
        checkDomain(`${slug}.co`),
      ])
      const availability: DomainAvailability = { com, io, co, alternates: [] }
      return { name: c.name, availability }
    })
  )

  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return [result.value.name, result.value.availability]
      }
      const fallback: DomainAvailability = {
        com: 'uncertain',
        io: 'uncertain',
        co: 'uncertain',
        alternates: [],
      }
      return [candidates[i].name, fallback]
    })
  )
}
