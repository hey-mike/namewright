// Maps the IntakeForm geography options (string-matched against the form's
// chip values) to registry office codes. Lowercase to match Signa's response
// `office_code` field. Falls back to a global sweep when geography is unset
// or unrecognised so we never silently narrow the search.
export const GEOGRAPHY_TO_OFFICES: Record<string, string[]> = {
  'US-first': ['uspto'],
  Global: ['uspto', 'euipo', 'ipau', 'jpo', 'cnipa'],
  'Australia / APAC': ['ipau', 'jpo', 'cnipa', 'uspto'],
  Europe: ['euipo', 'ukipo'],
  'China / Asia': ['cnipa', 'jpo', 'ipau', 'uspto'],
}

const FALLBACK_OFFICES = GEOGRAPHY_TO_OFFICES['Global']

export function officesForGeography(geography: string): string[] {
  return GEOGRAPHY_TO_OFFICES[geography] ?? FALLBACK_OFFICES
}
