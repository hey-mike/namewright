export const TLDS = ['com', 'io', 'co'] as const
export type Tld = (typeof TLDS)[number]
export type DomainStatus = 'likely available' | 'likely taken' | 'uncertain'

export interface DomainAvailability extends Record<Tld, DomainStatus> {
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
