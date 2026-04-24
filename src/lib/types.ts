export const SUPPORTED_TLDS = ['com', 'io', 'co', 'net', 'org', 'app', 'dev', 'ai', 'xyz'] as const
export type SupportedTld = (typeof SUPPORTED_TLDS)[number]
export const DEFAULT_TLDS: SupportedTld[] = ['com', 'io', 'co']

export type DomainStatus = 'available' | 'taken' | 'likely taken' | 'uncertain'

export interface DomainAvailability {
  tlds: Record<string, DomainStatus>
  alternates: string[]
}

export interface CandidateProposal {
  name: string
  style: 'descriptive' | 'invented' | 'metaphorical' | 'acronym' | 'compound'
  rationale: string
}

export interface Candidate extends CandidateProposal {
  trademarkRisk: 'low' | 'moderate' | 'high' | 'uncertain'
  trademarkNotes: string
  domains: DomainAvailability
}

export interface TopPick {
  name: string
  reasoning: string
  nextSteps: string
}

export interface ReportData {
  summary: string
  candidates: Candidate[]
  topPicks: TopPick[]
  recommendation: string
}

export interface GenerateRequest {
  description: string
  personality: string
  constraints?: string
  geography: string
  tlds: string[]
}

export interface GenerateResponse {
  reportId: string
  preview: Candidate[]
  summary: string
}

export interface SessionPayload {
  reportId: string
  paid: boolean
  iat: number
  exp: number
}

export type TrademarkRisk = 'low' | 'moderate' | 'high' | 'uncertain'

// Higher = more concerning. 'uncertain' below 'low' so a concrete result
// always beats a missing one.
export const RISK_RANK: Record<TrademarkRisk, number> = {
  uncertain: -1,
  low: 0,
  moderate: 1,
  high: 2,
}

// Allowlists for /api/generate boundary validation. Must stay in sync with
// IntakeForm chip values per .claude/rules/contracts.md.
export const PERSONALITY_VALUES = [
  'Serious / technical',
  'Playful / approachable',
  'Premium / refined',
  'Utilitarian / direct',
  'Bold / contrarian',
] as const
export type Personality = (typeof PERSONALITY_VALUES)[number]

export const GEOGRAPHY_VALUES = [
  'US-first',
  'Global',
  'Australia / APAC',
  'Europe',
  'China / Asia',
] as const
export type Geography = (typeof GEOGRAPHY_VALUES)[number]
