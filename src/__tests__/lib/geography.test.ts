import { officesForGeography, GEOGRAPHY_TO_OFFICES } from '@/lib/geography'

describe('officesForGeography', () => {
  it('returns USPTO only for US-first', () => {
    expect(officesForGeography('US-first')).toEqual(['uspto'])
  })

  it('returns the broadest set for Global', () => {
    expect(officesForGeography('Global')).toContain('uspto')
    expect(officesForGeography('Global')).toContain('euipo')
    expect(officesForGeography('Global')).toContain('cnipa')
  })

  it('routes Europe to EUIPO and UKIPO', () => {
    expect(officesForGeography('Europe')).toEqual(['euipo', 'ukipo'])
  })

  it('falls back to the global sweep for an unknown geography string', () => {
    expect(officesForGeography('Mars')).toEqual(GEOGRAPHY_TO_OFFICES['Global'])
  })

  it('falls back to the global sweep for an empty string', () => {
    expect(officesForGeography('')).toEqual(GEOGRAPHY_TO_OFFICES['Global'])
  })
})
