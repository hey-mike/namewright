export interface DomainAvailability {
  com: 'likely available' | 'likely taken' | 'uncertain'
  io: 'likely available' | 'likely taken' | 'uncertain'
  co: 'likely available' | 'likely taken' | 'uncertain'
  alternates: string[]
}

export interface Candidate {
  name: string
  style: 'descriptive' | 'invented' | 'metaphorical' | 'acronym' | 'compound'
  rationale: string
  trademarkRisk: 'low' | 'moderate' | 'high'
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
  constraints: string
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
