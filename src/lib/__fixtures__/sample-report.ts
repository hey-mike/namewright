import type { ReportData } from '../types'

// Public-safe ReportData fixture rendered by the /sample route to show
// prospective customers the format and depth of a paid Namewright report
// without requiring payment.
//
// Distinct from dev-report.ts (which exists for dev-mock-pipeline end-to-end
// testing) because:
//   - All trademark conflict citations are FICTIONAL — invented owner
//     entities, invented registration numbers — to avoid implying Namewright
//     has cleared a real-world brand or to associate any real entity with a
//     conflict.
//   - Registration numbers use an obviously out-of-range pattern (9,500,xxx)
//     that does not collide with real USPTO issued numbering. If you change
//     these, keep them clearly fictional — do not use plausible-looking 4M
//     or 5M-series numbers.
//   - All candidate names are fictional and were composed for this fixture.
//
// The brief is a believable solo-founder scenario (AI-powered customer
// support agent for SaaS teams) and exercises the same UI surface area as a
// real report: 9 candidates spanning the style enum, mixed trademark risk,
// realistic per-source domain signals, 3 topPicks with nextSteps.
export const SAMPLE_REPORT: ReportData = {
  summary:
    'A solo founder building an AI agent that resolves customer-support tickets autonomously for B2B SaaS teams. Personality: serious / technical. Geography: US-first. Names should sound credible to engineering buyers and avoid customer-service genericisms.',
  candidates: [
    {
      name: 'Resolvyn',
      style: 'invented',
      rationale:
        "An invented mark built from 'resolve' with a distinctive '-yn' suffix that gives it a software-product cadence. Strong trademark posture because the combined form has no prior art, and the meaning is still legible to a buyer reading it cold.",
      trademarkRisk: 'low',
      trademarkNotes:
        'No live conflicts found in Signa + EUIPO across Class 9 / 42. Closest located mark is RESOLVE+ (USPTO, dead, reg #9,500,001) — abandoned, no continued-use claim.',
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
      name: 'Tendril',
      style: 'metaphorical',
      rationale:
        'Evokes the way a support agent reaches into many threads at once — visual, organic, and quietly technical. Reads as a serious software product without leaning on overused AI tropes.',
      trademarkRisk: 'low',
      trademarkNotes:
        'No live Class 9 / 42 conflicts in Signa + EUIPO. One historical TENDRIL (USPTO, dead, reg #9,500,002, abandoned 2020) in Class 25 (apparel) — unrelated field, low confusion risk.',
      domains: {
        tlds: { com: 'likely taken', io: 'available', co: 'available' },
        tldSignals: {
          com: { dns: 'taken', rdap: null, registrar: null },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
        },
        alternates: ['trytendril.com', 'tendril.app'],
      },
    },
    {
      name: 'Quoraline',
      style: 'invented',
      rationale:
        "A coined word combining 'quorum' (consensus, agreement) with the '-line' suffix found in support-channel branding. Distinctive enough to register, soft enough to read as approachable.",
      trademarkRisk: 'low',
      trademarkNotes:
        'No conflicts located in Signa + EUIPO. Fully invented term — no prior registrations identified across queried offices.',
      domains: {
        tlds: { com: 'available', io: 'available', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: null, registrar: null },
        },
        alternates: [],
      },
    },
    {
      name: 'Helpcraft',
      style: 'compound',
      rationale:
        "Compound of 'help' + 'craft' — positions the product as a deliberate, well-built support tool rather than a chatbot. Pronounceable, indexable, and easy to say aloud in a sales call.",
      trademarkRisk: 'moderate',
      trademarkNotes:
        'Crowded help-prefixed field. Closest live conflict: HELPCRAFT (USPTO, live, Class 42, reg #9,500,003, owner: Brightseam Studios LLC) covers software for help-desk workflows — direct overlap. Recommend attorney clearance before filing.',
      domains: {
        tlds: { com: 'taken', io: 'available', co: 'available' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
        },
        alternates: ['gethelpcraft.com', 'helpcraft.app'],
      },
    },
    {
      name: 'Lattice',
      style: 'metaphorical',
      rationale:
        'Suggests an interconnected support structure — fitting for an agent that ties tickets, knowledge bases, and humans together. The metaphor lands quickly with technical buyers.',
      trademarkRisk: 'high',
      trademarkNotes:
        'Heavily conflicted. Multiple live Class 9 / 42 registrations including LATTICE (USPTO, live, Class 42, reg #9,500,004, owner: Northwind Performance Systems Inc.) covering HR / workforce SaaS. Consumer recognition of the term in this field creates strong confusion risk.',
      domains: {
        tlds: { com: 'taken', io: 'taken', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          co: { dns: 'taken', rdap: null, registrar: null },
        },
        alternates: ['trylattice.io', 'getlattice.com'],
      },
    },
    {
      name: 'Cleardesk',
      style: 'descriptive',
      rationale:
        "Plainly describes the outcome — a cleared queue. Easy to remember and explain, but the descriptive register makes the mark harder to defend on a trademark register and crowds it among 'clear-' help-desk tools.",
      trademarkRisk: 'moderate',
      trademarkNotes:
        'Several live marks in adjacent classes. Closest: CLEARDESK (USPTO, live, Class 9, reg #9,500,005, owner: Stoneridge Avenue Software Co.) covers ticketing software — meaningful overlap with the proposed use.',
      domains: {
        tlds: { com: 'likely taken', io: 'available', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: null, registrar: null },
          io: { dns: 'enotfound', rdap: 'available', registrar: 'available' },
          co: { dns: 'enotfound', rdap: null, registrar: null },
        },
        alternates: ['clrdesk.com', 'cleardesk.app'],
      },
    },
    {
      name: 'TRIA',
      style: 'acronym',
      rationale:
        'Reads as a short, declarative system name (Triage / Resolution / Intelligence / Assist). Tight four-letter mark with strong typographic presence — fitting for a serious-toned engineering buyer.',
      trademarkRisk: 'moderate',
      trademarkNotes:
        'Short marks are heavily contested. TRIA (USPTO, live, Class 9, reg #9,500,006, owner: Marshfield Lane Health Inc.) covers medical-device software — different field, but the visual/aural similarity in a four-letter mark warrants caution.',
      domains: {
        tlds: { com: 'taken', io: 'taken', co: 'uncertain' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          co: { dns: 'enotfound', rdap: null, registrar: null },
        },
        alternates: ['trytria.com', 'tria.ai'],
      },
    },
    {
      name: 'Quietstack',
      style: 'compound',
      rationale:
        "Compound of 'quiet' (the result of cleared tickets) + 'stack' (the technical layer the product slots into). The pairing is unusual enough to be ownable and conveys product positioning at the same time.",
      trademarkRisk: 'low',
      trademarkNotes:
        'No live Class 9 / 42 conflicts in Signa + EUIPO. One QUIETSTACK (USPTO, dead, reg #9,500,007, abandoned 2018) — no continued use, low risk on revival.',
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
      name: 'Inboxwarden',
      style: 'compound',
      rationale:
        "Domain unavailable — naming inspiration only. Compound of 'inbox' + 'warden' captures the role (someone who guards the queue) but every common TLD is taken and no obvious modifier creates a defensible alternative.",
      trademarkRisk: 'low',
      trademarkNotes:
        'No live conflicts located in Signa + EUIPO across Class 9 / 42. Listed primarily for naming inspiration — pursue only if the domain situation changes.',
      domains: {
        tlds: { com: 'taken', io: 'taken', co: 'taken' },
        tldSignals: {
          com: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          io: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
          co: { dns: 'taken', rdap: 'taken', registrar: 'taken' },
        },
        alternates: ['tryinboxwarden.com', 'getinboxwarden.io'],
      },
    },
  ],
  topPicks: [
    {
      name: 'Resolvyn',
      reasoning:
        'Strongest overall posture in this set — clear trademark field, all three priority TLDs available, and the meaning of the mark is still legible to a buyer reading it for the first time. Defensible on the register and bookable today.',
      nextSteps:
        'Register resolvyn.com, resolvyn.io, and resolvyn.co before announcing. File a US intent-to-use application in Class 42 once an attorney has run a full clearance search; budget 1–2 hours of attorney time at standard rates.',
    },
    {
      name: 'Quietstack',
      reasoning:
        'Strong second pick — every priority TLD is available and the register is clean. The compound is unusual enough to own and the meaning ties directly to the product outcome. Good fit if the founder wants a name with built-in positioning.',
      nextSteps:
        'Register quietstack.com, quietstack.io, and quietstack.co. File US Class 42 intent-to-use after attorney clearance. Consider a Class 9 filing alongside Class 42 to cover the downloadable-software dimension.',
    },
    {
      name: 'Quoraline',
      reasoning:
        'Fully invented and registerable globally — the highest distinctiveness ceiling of the three. Slightly softer phonetics than Resolvyn, which may or may not match the serious / technical personality the founder picked.',
      nextSteps:
        'Register quoraline.com and quoraline.io. Confirm quoraline.co status with a registrar lookup (signal sources disagreed). File US Class 42 intent-to-use under the invented-mark exception for fastest path to registration.',
    },
  ],
  recommendation:
    'Resolvyn is the strongest single candidate and the one to secure first — clear trademark field, every priority TLD available, and the mark still communicates the product on first read. Quietstack is the strongest backup and worth registering defensively. Avoid Lattice and Inboxwarden: the first is too crowded on the register, the second has no usable domain story.',
}
