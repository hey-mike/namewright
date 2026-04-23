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
