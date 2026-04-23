import { lookup } from 'dns/promises'
import type { CandidateProposal, DomainAvailability, DomainStatus } from './types'
import logger from './logger'

type DnsResult = 'taken' | 'enotfound' | 'error'
type LayerResult = 'taken' | 'available' | null

async function checkDns(hostname: string): Promise<DnsResult> {
  try {
    await lookup(hostname)
    return 'taken'
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return e.code === 'ENOTFOUND' ? 'enotfound' : 'error'
  }
}

async function checkRdap(hostname: string): Promise<LayerResult> {
  try {
    const res = await fetch(`https://rdap.org/domain/${hostname}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 200) return 'taken'
    if (res.status === 404) return 'available'
    return null
  } catch {
    return null
  }
}

async function checkWhoisJson(hostname: string): Promise<LayerResult> {
  const key = process.env.WHOISJSON_API_KEY
  if (!key) return null
  try {
    const url = `https://whoisjson.com/api/v1/domain-availability?domain=${hostname}`
    const res = await fetch(url, {
      headers: { Authorization: `TOKEN=${key}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { registered?: boolean }
    if (data.registered === false) return 'available'
    if (data.registered === true) return 'taken'
    return null
  } catch {
    return null
  }
}

export function aggregateDomainStatus(
  dns: DnsResult,
  rdap: LayerResult,
  dd: LayerResult
): DomainStatus {
  // Strong taken: DNS active + at least one secondary confirms
  if (dns === 'taken' && (rdap === 'taken' || dd === 'taken')) return 'taken'
  // Both secondaries agree taken (covers parked domains with no DNS)
  if (rdap === 'taken' && dd === 'taken') return 'taken'

  // Wildcard DNS: DNS resolves but a secondary says available
  if (dns === 'taken' && (rdap === 'available' || dd === 'available')) return 'uncertain'

  // DNS taken with no secondary data to contradict
  if (dns === 'taken') return 'likely taken'

  // DNS not found: available if at least one secondary confirms
  if (dns === 'enotfound' && (rdap === 'available' || dd === 'available')) return 'available'

  return 'uncertain'
}

async function checkDomain(hostname: string): Promise<DomainStatus> {
  const [dnsResult, rdapResult, wjResult] = await Promise.allSettled([
    checkDns(hostname),
    checkRdap(hostname),
    checkWhoisJson(hostname),
  ])

  const dns = dnsResult.status === 'fulfilled' ? dnsResult.value : 'error'
  const rdap = rdapResult.status === 'fulfilled' ? rdapResult.value : null
  const dd = wjResult.status === 'fulfilled' ? wjResult.value : null

  const status = aggregateDomainStatus(dns, rdap, dd)
  logger.debug({ hostname, dns, rdap, dd, status }, 'domain check')
  return status
}

export async function checkAllDomains(
  candidates: CandidateProposal[],
  tlds: string[]
): Promise<Map<string, DomainAvailability>> {
  const settled = await Promise.allSettled(
    candidates.map(async (c) => {
      const slug = c.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const statuses = await Promise.all(tlds.map((tld) => checkDomain(`${slug}.${tld}`)))
      const availability: DomainAvailability = {
        tlds: Object.fromEntries(tlds.map((tld, i) => [tld, statuses[i]])),
        alternates: [],
      }
      return { name: c.name, availability }
    })
  )

  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return [result.value.name, result.value.availability]
      }
      const fallback: DomainAvailability = {
        tlds: Object.fromEntries(tlds.map((tld) => [tld, 'uncertain' as DomainStatus])),
        alternates: [],
      }
      return [candidates[i].name, fallback]
    })
  )
}
