import Anthropic from '@anthropic-ai/sdk'
import type { ReportData, GenerateRequest, CandidateProposal } from './types'
import { checkAllTrademarks } from './signa'
import { checkAllDomains } from './dns'

const client = new Anthropic()

const VALID_STYLES = new Set(['descriptive', 'invented', 'metaphorical', 'acronym', 'compound'])
const VALID_RISKS = new Set(['low', 'moderate', 'high'])
const VALID_DOMAIN_STATUS = new Set(['likely available', 'likely taken', 'uncertain'])

function validateReportData(data: unknown): ReportData {
  if (!data || typeof data !== 'object') throw new Error('Report is not an object')
  const d = data as Record<string, unknown>

  if (typeof d.summary !== 'string' || !d.summary) throw new Error('Missing or invalid summary')
  if (typeof d.recommendation !== 'string') throw new Error('Missing recommendation')
  if (!Array.isArray(d.candidates) || d.candidates.length === 0) throw new Error('candidates must be a non-empty array')
  if (!Array.isArray(d.topPicks)) throw new Error('topPicks must be an array')

  for (const [i, c] of (d.candidates as unknown[]).entries()) {
    if (!c || typeof c !== 'object') throw new Error(`candidates[${i}] is not an object`)
    const candidate = c as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !candidate.name) throw new Error(`candidates[${i}].name missing`)
    if (!VALID_STYLES.has(candidate.style as string)) throw new Error(`candidates[${i}].style invalid: ${candidate.style}`)
    if (!VALID_RISKS.has(candidate.trademarkRisk as string)) throw new Error(`candidates[${i}].trademarkRisk invalid: ${candidate.trademarkRisk}`)
    if (typeof candidate.rationale !== 'string') throw new Error(`candidates[${i}].rationale missing`)
    if (typeof candidate.trademarkNotes !== 'string') throw new Error(`candidates[${i}].trademarkNotes missing`)
    const domains = candidate.domains as Record<string, unknown>
    if (!domains || typeof domains !== 'object') throw new Error(`candidates[${i}].domains missing`)
    for (const tld of ['com', 'io', 'co'] as const) {
      if (!VALID_DOMAIN_STATUS.has(domains[tld] as string)) throw new Error(`candidates[${i}].domains.${tld} invalid`)
    }
    if (!Array.isArray(domains.alternates)) throw new Error(`candidates[${i}].domains.alternates missing`)
  }

  return d as unknown as ReportData
}

export function parseReport(text: string): ReportData {
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')

  const parsed = JSON.parse(stripped.slice(start, end + 1))
  return validateReportData(parsed)
}

export function parseProposals(text: string): CandidateProposal[] {
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array found in response')

  const parsed = JSON.parse(stripped.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('Response is not an array')
  if (parsed.length < 5) throw new Error(`Too few candidates: ${parsed.length}`)

  for (const [i, c] of (parsed as unknown[]).entries()) {
    if (!c || typeof c !== 'object') throw new Error(`candidates[${i}] is not an object`)
    const candidate = c as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !candidate.name) throw new Error(`candidates[${i}].name missing`)
    if (!VALID_STYLES.has(candidate.style as string)) throw new Error(`candidates[${i}].style invalid: ${candidate.style}`)
    if (typeof candidate.rationale !== 'string' || !candidate.rationale) throw new Error(`candidates[${i}].rationale missing`)
  }

  return parsed as CandidateProposal[]
}

const GENERATE_CANDIDATES_PROMPT = `You are a brand naming specialist. Generate 8-12 brand name candidates for the product described.

# Instructions
- Vary naming styles: descriptive, invented, metaphorical, acronym, compound.
- Weight styles toward what fits the brand personality:
  - "Serious / technical" or "Utilitarian / direct" → favour descriptive and compound; avoid metaphorical
  - "Playful / approachable" or "Bold / contrarian" → favour invented and metaphorical
  - "Premium / refined" → favour invented and compound
- Each name must be: pronounceable, distinctive, not too close to famous brands, not generic.
- For each candidate write 2-3 sentences of strategic rationale explaining why it fits.

# Output
Respond with ONLY a valid JSON array. No markdown, no preamble. Schema:
[
  {
    "name": "string",
    "style": "descriptive | invented | metaphorical | acronym | compound",
    "rationale": "2-3 sentences"
  }
]

Return 8-12 items. No trademark or domain data — that is handled separately.`

export async function generateCandidates(req: GenerateRequest): Promise<CandidateProposal[]> {
  const userMessage = `Product: ${req.description}
Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none'}
Primary market: ${req.geography}

Generate brand name candidates as a JSON array.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: GENERATE_CANDIDATES_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: undefined,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim()

    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    return parseProposals(text)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('Anthropic rate limit reached. Please try again in a moment.')
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('Anthropic API key is invalid.')
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error ${err.status}: ${err.message}`)
    }
    throw err
  }
}

interface VerifiedCandidate extends CandidateProposal {
  trademark: import('./signa').TrademarkCheckResult
  domains: import('./types').DomainAvailability
}

const SYNTHESISE_REPORT_PROMPT = `You are a brand strategy expert. You have been given a list of brand name candidates with verified trademark search results and real domain availability data. Your task is to produce a final, comprehensive brand name report.

# Instructions
- Use the trademark data provided to assess risk accurately — cite specific conflicts or explain why risk is low
- Use the domain data provided to fill domain availability — do NOT override verified DNS results
- For domains marked as taken, suggest 2-3 creative alternate domain strings (e.g. getbrandname.com, trybrandname.io)
- Select exactly 3 topPicks — the candidates with the best combined trademark safety and domain availability
- Rank the full candidates array from most to least viable
- Write actionable nextSteps for each topPick (e.g. "File USPTO application in Nice Class 42", "Register acmely.io immediately")

# Output
Respond with ONLY a valid JSON object. No markdown, no preamble. Use this schema exactly:

{
  "summary": "1-2 sentence recap of what the user is building",
  "candidates": [
    {
      "name": "string — must match a provided candidate name exactly",
      "style": "descriptive | invented | metaphorical | acronym | compound",
      "rationale": "2-3 sentences",
      "trademarkRisk": "low | moderate | high",
      "trademarkNotes": "1-2 sentences citing Signa findings",
      "domains": {
        "com": "likely available | likely taken | uncertain",
        "io": "likely available | likely taken | uncertain",
        "co": "likely available | likely taken | uncertain",
        "alternates": ["string"]
      }
    }
  ],
  "topPicks": [
    { "name": "must match a candidate name", "reasoning": "why this is safest", "nextSteps": "specific actions" }
  ],
  "recommendation": "1-2 sentences on the top 1-2 to pursue first"
}`

export async function synthesiseReport(
  req: GenerateRequest,
  verified: VerifiedCandidate[]
): Promise<ReportData> {
  const candidateLines = verified.map((v) =>
    `Name: ${v.name}
Style: ${v.style}
Rationale: ${v.rationale}
Trademark (Signa): ${v.trademark.risk} risk — ${v.trademark.notes}
Domain .com: ${v.domains.com}
Domain .io: ${v.domains.io}
Domain .co: ${v.domains.co}`
  ).join('\n\n---\n\n')

  const userMessage = `Product: ${req.description}
Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none'}
Primary market: ${req.geography}

Verified candidates:

${candidateLines}

Produce the final brand name report as JSON.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYNTHESISE_REPORT_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim()

    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    return parseReport(text)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('Anthropic rate limit reached. Please try again in a moment.')
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('Anthropic API key is invalid.')
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error ${err.status}: ${err.message}`)
    }
    throw err
  }
}

export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  // Step 1: Generate candidate names
  const proposals = await generateCandidates(req)

  // Step 2: Verify in parallel — fail open on total outage
  let trademarkMap: Map<string, import('./signa').TrademarkCheckResult> = new Map()
  let domainMap: Map<string, import('./types').DomainAvailability> = new Map()

  try {
    trademarkMap = await checkAllTrademarks(proposals, 42)
  } catch (err) {
    console.error('[generateReport] trademark verification failed, proceeding with empty data:', err)
  }
  try {
    domainMap = await checkAllDomains(proposals)
  } catch (err) {
    console.error('[generateReport] domain verification failed, proceeding with empty data:', err)
  }

  // Step 3: Merge into VerifiedCandidate[]
  const verified: VerifiedCandidate[] = proposals.map((p) => ({
    ...p,
    trademark: trademarkMap.get(p.name) ?? {
      candidateName: p.name,
      risk: 'uncertain' as const,
      notes: 'Trademark search unavailable. Manual verification recommended.',
      sources: [],
    },
    domains: domainMap.get(p.name) ?? {
      com: 'uncertain' as const,
      io: 'uncertain' as const,
      co: 'uncertain' as const,
      alternates: [],
    },
  }))

  // Step 4: Synthesise final report
  return synthesiseReport(req, verified)
}
