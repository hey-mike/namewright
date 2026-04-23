// Maps the IntakeForm geography options (string-matched against the form's
// chip values) to registry office codes. Lowercase to match Signa's response
// `office_code` field.
//
// Signa currently supports: uspto, euipo, wipo. When Signa adds direct
// integrations for UKIPO / IP Australia / JPO / CNIPA (or when we ship our
// own direct integrations under the euipo-direct-cross-check pattern), extend
// the relevant region here.
//
// WIPO = World Intellectual Property Organization Madrid Protocol filings.
// Hitting WIPO catches international trademark filings designating APAC,
// Asia, and most other non-US/EU jurisdictions, so it's a pragmatic stand-in
// for "global trademark coverage" until more direct offices are integrated.
//
// Falls back to a global sweep when geography is unset or unrecognised so we
// never silently narrow the search.
export const GEOGRAPHY_TO_OFFICES: Record<string, string[]> = {
  'US-first': ['uspto'],
  Global: ['uspto', 'euipo', 'wipo'],
  'Australia / APAC': ['wipo', 'uspto'],
  Europe: ['euipo'],
  'China / Asia': ['wipo', 'uspto'],
}

const FALLBACK_OFFICES = GEOGRAPHY_TO_OFFICES['Global']

export function officesForGeography(geography: string): string[] {
  return GEOGRAPHY_TO_OFFICES[geography] ?? FALLBACK_OFFICES
}
