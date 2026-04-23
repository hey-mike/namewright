import { officesForGeography, GEOGRAPHY_TO_OFFICES } from '@/lib/geography'

describe('officesForGeography', () => {
  it('returns USPTO only for US-first', () => {
    expect(officesForGeography('US-first')).toEqual(['uspto'])
  })

  it('returns USPTO + EUIPO + WIPO for Global (Signa-supported set)', () => {
    expect(officesForGeography('Global')).toEqual(['uspto', 'euipo', 'wipo'])
  })

  it('routes Europe to EUIPO only (UKIPO not yet supported by Signa)', () => {
    expect(officesForGeography('Europe')).toEqual(['euipo'])
  })

  it('routes APAC and Asia regions to WIPO + USPTO (Madrid proxy)', () => {
    expect(officesForGeography('Australia / APAC')).toEqual(['wipo', 'uspto'])
    expect(officesForGeography('China / Asia')).toEqual(['wipo', 'uspto'])
  })

  it('falls back to the global sweep for an unknown geography string', () => {
    expect(officesForGeography('Mars')).toEqual(GEOGRAPHY_TO_OFFICES['Global'])
  })

  it('falls back to the global sweep for an empty string', () => {
    expect(officesForGeography('')).toEqual(GEOGRAPHY_TO_OFFICES['Global'])
  })
})
