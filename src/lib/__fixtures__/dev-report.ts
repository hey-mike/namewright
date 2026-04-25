import type { ReportData } from '../types'

// Canned ReportData returned by generateReport() when DEV_MOCK_PIPELINE=1.
// Used exclusively for local end-to-end testing (Stripe checkout flow,
// webhook + email delivery, UI rendering) without burning Anthropic/Signa/
// WhoisJSON quota on every purchase test.
//
// Derived from a real 2026-04-24 audit-run report (brief: async standup
// SaaS, Premium/refined, Global) — shape is verified identical to what the
// production pipeline actually produces so the UI path exercises realistic
// data (mix of trademark risks, mix of domain statuses, 3 topPicks with
// nextSteps).
//
// IMPORTANT: this file should NEVER be returned in production. Guarded at
// the generateReport() call site with an explicit NODE_ENV check.
export const DEV_MOCK_REPORT: ReportData = {
  summary:
    'A mock brand-name report returned by the dev fixture when DEV_MOCK_PIPELINE=1 is set. Shape matches real production output so UI + Stripe + email flows can be tested without burning API quota.',
  candidates: [
    {
      name: 'Stndly',
      style: 'compound',
      rationale:
        "Compresses 'standup daily' into a tight, modern token that reads as a purposeful abbreviation rather than a generic descriptor. The vowel-stripped style is familiar from developer tooling, lending instant credibility with engineering audiences.",
      trademarkRisk: 'low',
      trademarkNotes:
        "No live conflicts share the mark string 'STNDLY.' Nearby marks are phonetically and visually sufficiently distinct to pose minimal confusion risk.",
      domains: {
        tlds: { com: 'available', io: 'available', co: 'available' },
        tldSignals: {
          com: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
        },
        alternates: [],
      },
    },
    {
      name: 'Driftlog',
      style: 'compound',
      rationale:
        'Evokes the metaphor of drift (asynchronous, continuous) paired with log (records, history). The pairing captures the product concept without being literal.',
      trademarkRisk: 'low',
      trademarkNotes: 'No live conflicts found for DRIFTLOG in Class 42 across queried offices.',
      domains: {
        tlds: { com: 'likely taken', io: 'available', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: null, registrar: null },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'taken', rdap: 'available', registrar: null },
        },
        alternates: [],
      },
    },
    {
      name: 'Quorient',
      style: 'invented',
      rationale:
        'A fully invented word combining quorum (consensus) and orient (direction). Distinctive, pronounceable, and trademark-registerable.',
      trademarkRisk: 'low',
      trademarkNotes:
        'No conflicts found in queried offices. Fully invented term with no prior registrations identified.',
      domains: {
        tlds: { com: 'available', io: 'uncertain', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          io: { dns: 'error', rdap: null, registrar: null },
          co: { dns: 'enotfound', rdap: null, registrar: null },
        },
        alternates: [],
      },
    },
    {
      name: 'Syncra',
      style: 'invented',
      rationale:
        'An invented name evoking synchronicity without being literal. Compact, memorable, and ends on an open vowel for brandability.',
      trademarkRisk: 'low',
      trademarkNotes:
        'All located conflicts are dead registrations — SYNCRA (USPTO, dead, Class 9/42). Clear Class 42 field in both USPTO and EUIPO.',
      domains: {
        tlds: { com: 'uncertain', io: 'uncertain', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'available', registrar: null },
          io: { dns: 'error', rdap: null, registrar: null },
          co: { dns: 'taken', rdap: null, registrar: 'available' },
        },
        alternates: [],
      },
    },
    {
      name: 'Cadence',
      style: 'metaphorical',
      rationale:
        'Conveys rhythm and regular pacing — core to what standups provide. However, the word is broadly used in tech branding.',
      trademarkRisk: 'moderate',
      trademarkNotes:
        'Multiple live conflicts exist: CADENCE (USPTO, live, Class 42, reg #3474135, owner: Cadence Design Systems, Inc.) creates a crowded Class 42 landscape.',
      domains: {
        tlds: { com: 'taken', io: 'available', co: 'available' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
        },
        alternates: [],
      },
    },
    {
      name: 'Meridian',
      style: 'metaphorical',
      rationale:
        'Implies a clear point of reference and direction — fitting for a product that orients teams. But heavily used across categories.',
      trademarkRisk: 'moderate',
      trademarkNotes:
        'Heavily conflicted: MERIDIAN (USPTO, live, Class 9/42, reg #8119234, owner: American Megatrends International, LLC).',
      domains: {
        tlds: { com: 'taken', io: 'uncertain', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'taken', rdap: 'available', registrar: null },
          co: { dns: 'taken', rdap: null, registrar: null },
        },
        alternates: [],
      },
    },
    {
      name: 'Pellucid',
      style: 'descriptive',
      rationale:
        'An elevated synonym for clear — fitting for a product that makes team communication transparent. The formal register matches the Premium personality.',
      trademarkRisk: 'low',
      trademarkNotes:
        'Located conflicts — PELLUCID (USPTO, dead, Class 42, reg #4467413) — are all dead registrations.',
      domains: {
        tlds: { com: 'likely taken', io: 'likely taken', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: null, registrar: null },
          io: { dns: 'taken', rdap: null, registrar: null },
          co: { dns: 'taken', rdap: 'available', registrar: null },
        },
        alternates: [],
      },
    },
    {
      name: 'Domedrun',
      style: 'compound',
      rationale:
        'Domain unavailable — naming inspiration only. Compound of dome (shelter, gathering) and drun (imagined action-word). Distinctive but no viable domains.',
      trademarkRisk: 'low',
      trademarkNotes: 'No conflicts found in queried offices.',
      domains: {
        tlds: { com: 'taken', io: 'taken', co: 'taken' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          co: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
        },
        alternates: ['trydomedrun.com', 'getdomedrun.io'],
      },
    },
  ],
  topPicks: [
    {
      name: 'Stndly',
      reasoning:
        'The strongest candidate — all three TLDs available and zero trademark conflicts. Clear path to registration globally.',
      nextSteps:
        'Register stndly.com, stndly.io, and stndly.co immediately. File USPTO intent-to-use application in Class 42. Commission full clearance search before filing.',
    },
    {
      name: 'Driftlog',
      reasoning:
        'Strong alternative with driftlog.io available. Zero trademark conflicts in the searched offices. The metaphor of drift + log captures the product concept evocatively.',
      nextSteps:
        'Register driftlog.io immediately. Run WHOIS on driftlog.com to confirm availability. File USPTO application in Class 42 once clearance is confirmed.',
    },
    {
      name: 'Quorient',
      reasoning:
        'Fully invented, maximally distinctive, and quorient.com is available. Strongest trademark position.',
      nextSteps:
        'Register quorient.com immediately. File USPTO application in Class 42 under intent-to-use. Consider additional class filings (Class 9 for software).',
    },
  ],
  recommendation:
    'Stndly is the strongest candidate and should be secured first — all three major TLDs are available today and the trademark landscape is clear. Driftlog is a strong metaphor-driven alternative with driftlog.io available for immediate registration.',
}

export function getDevMockReport(): ReportData {
  // Runtime safety — refuse to return the mock in a production deployment
  // even if DEV_MOCK_PIPELINE is accidentally set on Vercel prod env.
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'DEV_MOCK_PIPELINE is not allowed in production. Unset the env var or remove from Vercel prod.'
    )
  }
  return DEV_MOCK_REPORT
}
