import Anthropic from '@anthropic-ai/sdk'
import { TLDS } from './types'
import type { ReportData, GenerateRequest, CandidateProposal } from './types'
import { checkAllTrademarks, TRADEMARK_UNAVAILABLE_NOTES } from './signa'
import { checkAllDomains } from './dns'

const client = new Anthropic()

const VALID_STYLES = new Set(['descriptive', 'invented', 'metaphorical', 'acronym', 'compound'])
const VALID_RISKS = new Set(['low', 'moderate', 'high', 'uncertain'])
const VALID_DOMAIN_STATUS = new Set(['likely available', 'likely taken', 'uncertain'])

// Nice Class 42: computer software and SaaS services
const NICE_CLASS_SOFTWARE = 42

// Extracts text blocks from an Anthropic response; guards against tool-call-only endings
function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

// Finds the first valid JSON object/array in text by scanning from each candidate bracket,
// using lastIndexOf for the closing bracket. Handles model preamble with stray braces.
function extractJson(text: string, open: '{' | '['): unknown {
  const close = open === '{' ? '}' : ']'
  const end = text.lastIndexOf(close)
  if (end === -1) throw new Error(`No closing '${close}' found in response`)
  let idx = 0
  while (true) {
    const start = text.indexOf(open, idx)
    if (start === -1 || start > end)
      throw new Error(`No JSON ${open === '{' ? 'object' : 'array'} found in response`)
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      idx = start + 1
    }
  }
}

function rethrowAnthropicError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError)
    throw new Error('Anthropic rate limit reached. Please try again in a moment.')
  if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic API key is invalid.')
  if (err instanceof Anthropic.APIError)
    throw new Error(`Anthropic API error ${err.status}: ${err.message}`)
  throw err
}

function validateCandidateBase(c: unknown, i: number): void {
  if (!c || typeof c !== 'object') throw new Error(`candidates[${i}] is not an object`)
  const candidate = c as Record<string, unknown>
  if (typeof candidate.name !== 'string' || !candidate.name)
    throw new Error(`candidates[${i}].name missing`)
  if (!VALID_STYLES.has(candidate.style as string))
    throw new Error(`candidates[${i}].style invalid: ${candidate.style}`)
  if (typeof candidate.rationale !== 'string' || !candidate.rationale)
    throw new Error(`candidates[${i}].rationale missing`)
}

function validateReportData(data: unknown): ReportData {
  if (!data || typeof data !== 'object') throw new Error('Report is not an object')
  const d = data as Record<string, unknown>

  if (typeof d.summary !== 'string' || !d.summary) throw new Error('Missing or invalid summary')
  if (typeof d.recommendation !== 'string') throw new Error('Missing recommendation')
  if (!Array.isArray(d.candidates) || d.candidates.length === 0)
    throw new Error('candidates must be a non-empty array')
  if (!Array.isArray(d.topPicks)) throw new Error('topPicks must be an array')

  for (const [i, c] of (d.candidates as unknown[]).entries()) {
    validateCandidateBase(c, i)
    const candidate = c as Record<string, unknown>
    if (!VALID_RISKS.has(candidate.trademarkRisk as string))
      throw new Error(`candidates[${i}].trademarkRisk invalid: ${candidate.trademarkRisk}`)
    if (typeof candidate.trademarkNotes !== 'string')
      throw new Error(`candidates[${i}].trademarkNotes missing`)
    const domains = candidate.domains as Record<string, unknown>
    if (!domains || typeof domains !== 'object') throw new Error(`candidates[${i}].domains missing`)
    for (const tld of TLDS) {
      if (!VALID_DOMAIN_STATUS.has(domains[tld] as string))
        throw new Error(`candidates[${i}].domains.${tld} invalid`)
    }
    if (!Array.isArray(domains.alternates))
      throw new Error(`candidates[${i}].domains.alternates missing`)
  }

  // All fields validated above — cast is safe
  return d as unknown as ReportData
}

function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function parseReport(text: string): ReportData {
  const parsed = extractJson(stripFences(text), '{')
  return validateReportData(parsed)
}

export function parseProposals(text: string): CandidateProposal[] {
  const parsed = extractJson(stripFences(text), '[')
  if (!Array.isArray(parsed)) throw new Error('Response is not an array')
  if (parsed.length < 5) throw new Error(`Too few candidates: ${parsed.length}`)

  for (const [i, c] of (parsed as unknown[]).entries()) {
    validateCandidateBase(c, i)
  }

  return parsed as CandidateProposal[]
}

const GENERATE_CANDIDATES_PROMPT = `You are a brand naming specialist. Generate 8-12 brand name candidates for the product described.

# Instructions
- Prefer single-word names. Use a multi-word name only when no single word can capture the concept.
- Vary naming styles across: descriptive, invented, metaphorical, acronym, compound.
- Weight styles toward what fits the brand personality:
  - "Serious / technical" or "Utilitarian / direct" → favour descriptive and compound; avoid metaphorical
  - "Playful / approachable" or "Bold / contrarian" → favour invented and metaphorical
  - "Premium / refined" → favour invented and compound
- No two candidates should sound phonetically similar or share the same root word — spread across the full style spectrum.
- Each name must be: pronounceable, distinctive, not too close to famous brands, not generic.
- For each candidate write 2-3 sentences of strategic rationale explaining why it fits.

# Output
Respond with ONLY a valid JSON array. No markdown, no preamble.
Valid values for "style": "descriptive", "invented", "metaphorical", "acronym", "compound".

[
  {
    "name": "string — single word preferred",
    "style": "one of the five values listed above",
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
      max_tokens: 3000,
      system: GENERATE_CANDIDATES_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = extractText(response.content)
    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    return parseProposals(text)
  } catch (err) {
    rethrowAnthropicError(err)
  }
}

interface VerifiedCandidate extends CandidateProposal {
  trademark: import('./signa').TrademarkCheckResult
  domains: import('./types').DomainAvailability
}

const SYNTHESISE_REPORT_PROMPT = `You are a brand strategy expert. You have been given a list of brand name candidates with trademark search results and real domain availability data. Produce a final brand name report.

# Instructions
- Assess trademark risk using the data provided — cite specific conflicts found, or explain why risk is low or uncertain.
- Copy domain status values exactly as provided — do not change "likely available" to "likely taken" or vice versa.
- For each TLD marked as "likely taken", suggest 2-3 creative alternate domain strings (e.g. getbrandname.com, trybrandname.io). Leave "alternates" as an empty array if no TLD is taken.
- Select the 3 candidates with the best combined trademark safety and domain availability as topPicks. If fewer than 3 candidates are clearly defensible, include only those that are and explain the constraint in "reasoning".
- Rank the full candidates array from most to least viable.
- Write actionable nextSteps for each topPick (e.g. "File USPTO application in Nice Class 42", "Register acmely.io immediately").

# Output
Respond with ONLY a valid JSON object. No markdown, no preamble.
Valid values for "style": "descriptive", "invented", "metaphorical", "acronym", "compound".
Valid values for "trademarkRisk": "low", "moderate", "high", "uncertain".
Valid values for domain TLDs: "likely available", "likely taken", "uncertain".

{
  "summary": "1-2 sentence recap of what the user is building",
  "candidates": [
    {
      "name": "must match a provided candidate name exactly",
      "style": "one of the five style values listed above",
      "rationale": "2-3 sentences",
      "trademarkRisk": "one of the four risk values listed above",
      "trademarkNotes": "1-2 sentences on conflicts found or why risk is low",
      "domains": {
        "com": "one of the three domain status values listed above",
        "io": "one of the three domain status values listed above",
        "co": "one of the three domain status values listed above",
        "alternates": ["string — only for TLDs that are likely taken"]
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
  const candidateLines = verified
    .map(
      (v) =>
        `Name: ${v.name}
Style: ${v.style}
Rationale: ${v.rationale}
Trademark (Signa): ${v.trademark.risk} risk — ${v.trademark.notes}
Domain .com: ${v.domains.com}
Domain .io: ${v.domains.io}
Domain .co: ${v.domains.co}`
    )
    .join('\n\n---\n\n')

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
      max_tokens: 6000,
      system: SYNTHESISE_REPORT_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = extractText(response.content)
    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    return parseReport(text)
  } catch (err) {
    rethrowAnthropicError(err)
  }
}

export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  const proposals = await generateCandidates(req)

  let trademarkMap: Map<string, import('./signa').TrademarkCheckResult> = new Map()
  let domainMap: Map<string, import('./types').DomainAvailability> = new Map()

  // Run trademark and domain checks in parallel — independent I/O, fail open on either
  const [trademarkResult, domainResult] = await Promise.allSettled([
    checkAllTrademarks(proposals, NICE_CLASS_SOFTWARE),
    checkAllDomains(proposals),
  ])

  if (trademarkResult.status === 'fulfilled') {
    trademarkMap = trademarkResult.value
  } else {
    console.error('[generateReport] trademark verification failed:', trademarkResult.reason)
  }

  if (domainResult.status === 'fulfilled') {
    domainMap = domainResult.value
  } else {
    console.error('[generateReport] domain verification failed:', domainResult.reason)
  }

  if (trademarkResult.status === 'rejected' && domainResult.status === 'rejected') {
    throw new Error(
      'Both trademark and domain verification failed. Report cannot be generated without research data.'
    )
  }

  const verified: VerifiedCandidate[] = proposals.map((p) => ({
    ...p,
    trademark: trademarkMap.get(p.name) ?? {
      candidateName: p.name,
      risk: 'uncertain' as const,
      notes: TRADEMARK_UNAVAILABLE_NOTES,
      sources: [],
    },
    domains: domainMap.get(p.name) ?? {
      com: 'uncertain' as const,
      io: 'uncertain' as const,
      co: 'uncertain' as const,
      alternates: [],
    },
  }))

  return synthesiseReport(req, verified)
}
