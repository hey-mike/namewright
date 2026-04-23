jest.mock('dns/promises', () => ({ lookup: jest.fn() }))

import { lookup } from 'dns/promises'
import { checkAllDomains, aggregateDomainStatus } from '@/lib/dns'
import type { CandidateProposal } from '@/lib/types'

const mockLookup = lookup as jest.Mock

const CANDIDATES: CandidateProposal[] = [
  { name: 'Acmely', style: 'invented', rationale: 'Good.' },
  { name: 'Buildify', style: 'compound', rationale: 'Good.' },
]

const DEFAULT_TLDS = ['com', 'io', 'co']

function mockFetchByUrl(handlers: Record<string, { status: number; body?: unknown }>): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    for (const [pattern, resp] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: resp.status >= 200 && resp.status < 300,
          status: resp.status,
          json: async () => resp.body ?? {},
        })
      }
    }
    return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
  })
}

describe('aggregateDomainStatus', () => {
  it('returns taken when DNS active and RDAP confirms', () => {
    expect(aggregateDomainStatus('taken', 'taken', null)).toBe('taken')
  })

  it('returns taken when DNS active and DomainDuck confirms', () => {
    expect(aggregateDomainStatus('taken', null, 'taken')).toBe('taken')
  })

  it('returns taken when both secondaries confirm with no DNS', () => {
    expect(aggregateDomainStatus('enotfound', 'taken', 'taken')).toBe('taken')
  })

  it('returns uncertain for wildcard DNS when RDAP says available', () => {
    expect(aggregateDomainStatus('taken', 'available', null)).toBe('uncertain')
  })

  it('returns uncertain for wildcard DNS when DomainDuck says available', () => {
    expect(aggregateDomainStatus('taken', null, 'available')).toBe('uncertain')
  })

  it('returns likely taken when DNS active with no secondary data', () => {
    expect(aggregateDomainStatus('taken', null, null)).toBe('likely taken')
  })

  it('returns available when DNS ENOTFOUND and RDAP confirms', () => {
    expect(aggregateDomainStatus('enotfound', 'available', null)).toBe('available')
  })

  it('returns available when DNS ENOTFOUND and DomainDuck confirms', () => {
    expect(aggregateDomainStatus('enotfound', null, 'available')).toBe('available')
  })

  it('returns uncertain when DNS ENOTFOUND but no secondary confirmation', () => {
    expect(aggregateDomainStatus('enotfound', null, null)).toBe('uncertain')
  })

  it('returns uncertain on DNS error with no secondary data', () => {
    expect(aggregateDomainStatus('error', null, null)).toBe('uncertain')
  })

  it('returns available when all three layers confirm', () => {
    expect(aggregateDomainStatus('enotfound', 'available', 'available')).toBe('available')
  })
})

describe('checkAllDomains', () => {
  beforeEach(() => {
    mockLookup.mockReset()
    delete process.env.WHOISJSON_API_KEY
    mockFetchByUrl({ 'rdap.org': { status: 500 } })
  })

  it('returns taken when DNS resolves and RDAP confirms registration', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })
    mockFetchByUrl({ 'rdap.org': { status: 200 } })

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('taken')
  })

  it('returns likely taken when DNS resolves but RDAP fails', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })
    mockFetchByUrl({ 'rdap.org': { status: 500 } })

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('likely taken')
  })

  it('returns available when DNS ENOTFOUND and RDAP returns 404', async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    mockFetchByUrl({ 'rdap.org': { status: 404 } })

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('available')
  })

  it('returns uncertain when DNS ENOTFOUND and RDAP fails', async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    mockFetchByUrl({ 'rdap.org': { status: 500 } })

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('uncertain')
  })

  it('returns available via WhoisJSON when WHOISJSON_API_KEY is set and RDAP fails', async () => {
    process.env.WHOISJSON_API_KEY = 'test-key'
    mockLookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    mockFetchByUrl({
      'rdap.org': { status: 500 },
      'whoisjson.com': { status: 200, body: { registered: false } },
    })

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('available')
  })

  it('returns uncertain on unexpected DNS error', async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error('ETIMEOUT'), { code: 'ETIMEOUT' }))

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.get('Acmely')?.tlds.com).toBe('uncertain')
  })

  it('only checks the requested TLDs', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    const result = await checkAllDomains([CANDIDATES[0]], ['com', 'net'])
    expect(Object.keys(result.get('Acmely')?.tlds ?? {})).toEqual(['com', 'net'])
    expect(result.get('Acmely')?.tlds.io).toBeUndefined()
  })

  it('returns results for all candidates even if one fails entirely', async () => {
    mockLookup
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .com
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .io
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .co
      .mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))

    const result = await checkAllDomains(CANDIDATES, DEFAULT_TLDS)
    expect(result.has('Acmely')).toBe(true)
    expect(result.has('Buildify')).toBe(true)
  })

  it('lowercases and strips spaces from name for DNS lookup', async () => {
    const spaced: CandidateProposal[] = [{ name: 'My Brand', style: 'compound', rationale: 'x.' }]
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    await checkAllDomains(spaced, ['com'])
    expect(mockLookup).toHaveBeenCalledWith('my-brand.com')
  })
})
