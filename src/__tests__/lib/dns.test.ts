jest.mock('dns/promises', () => ({ lookup: jest.fn() }))

import { lookup } from 'dns/promises'
import { checkAllDomains } from '@/lib/dns'
import type { CandidateProposal } from '@/lib/types'

const mockLookup = lookup as jest.Mock

const CANDIDATES: CandidateProposal[] = [
  { name: 'Acmely', style: 'invented', rationale: 'Good.' },
  { name: 'Buildify', style: 'compound', rationale: 'Good.' },
]

describe('checkAllDomains', () => {
  beforeEach(() => {
    mockLookup.mockReset()
  })

  it('returns likely taken when DNS resolves', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('likely taken')
    expect(result.get('Acmely')?.io).toBe('likely taken')
    expect(result.get('Acmely')?.co).toBe('likely taken')
  })

  it('returns likely available when DNS returns ENOTFOUND', async () => {
    const err = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    mockLookup.mockRejectedValue(err)

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('likely available')
  })

  it('returns uncertain on unexpected DNS error', async () => {
    const err = Object.assign(new Error('ETIMEOUT'), { code: 'ETIMEOUT' })
    mockLookup.mockRejectedValue(err)

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('uncertain')
  })

  it('returns results for all candidates even if one fails', async () => {
    mockLookup
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .com
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .io
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .co
      .mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })) // all Buildify

    const result = await checkAllDomains(CANDIDATES)
    expect(result.has('Acmely')).toBe(true)
    expect(result.has('Buildify')).toBe(true)
  })

  it('lowercases and strips spaces from name for DNS lookup', async () => {
    const spaced: CandidateProposal[] = [{ name: 'My Brand', style: 'compound', rationale: 'x.' }]
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    await checkAllDomains(spaced)
    expect(mockLookup).toHaveBeenCalledWith('my-brand.com')
  })
})
