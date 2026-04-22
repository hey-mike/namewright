import Anthropic from '@anthropic-ai/sdk'
import type { WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages/messages'
import type { ReportData, GenerateRequest, CandidateProposal } from './types'

const client = new Anthropic()

export const SYSTEM_PROMPT = `# Role
You are a Brand Strategy Agent designed to support startup founders and solo developers in developing and validating brand identities. You combine expertise in naming strategy, trademark law fundamentals, and domain availability research.

# Task
Help users create strong brand names and verify their viability across trademark registries and domain name availability. Your output should be actionable and confidence-building.

# Instructions
- Generate 8-12 brand name candidates varying in style (descriptive, invented, metaphorical, acronyms, compound).
- For each: strategic rationale, trademark risk assessment (USE web_search to research real conflicts with established companies, products, services), domain availability inference.
- Rank by combined viability (trademark-clear AND likely-acquirable).
- Be honest when something requires official verification (USPTO, IP Australia, WHOIS, registrars).
- Do NOT generate unpronounceable, offensive, or legally risky names (too close to famous brands, generic terms, misleading descriptors).

# Output
You MUST respond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation outside the JSON. Schema:

{
  "summary": "1-2 sentence recap of what the user is building",
  "candidates": [
    {
      "name": "string",
      "style": "descriptive | invented | metaphorical | acronym | compound",
      "rationale": "2-3 sentences on why this works strategically",
      "trademarkRisk": "low | moderate | high",
      "trademarkNotes": "1-2 sentences citing any conflicts found or why risk is low",
      "domains": {
        "com": "likely available | likely taken | uncertain",
        "io": "likely available | likely taken | uncertain",
        "co": "likely available | likely taken | uncertain",
        "alternates": ["up to 3 suggested alternate domain strings if primary is taken"]
      }
    }
  ],
  "topPicks": [
    { "name": "must match a candidate name", "reasoning": "why this is a safest bet", "nextSteps": "specific verification actions" }
  ],
  "recommendation": "1-2 sentences naming the top 1-2 to pursue first and why"
}

Rank candidates array from most to least viable. Return 8-12 candidates and exactly 3 topPicks.`

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

  return parsed as CandidateProposal[]
}

const WEB_SEARCH_TOOL: WebSearchTool20250305 = { type: 'web_search_20250305', name: 'web_search' }

export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  const userMessage = `Product: ${req.description}

Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none specified'}
Primary market: ${req.geography}

Generate brand name candidates per the schema. Use web_search to research potential trademark conflicts for your strongest candidates. Return valid JSON only.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [WEB_SEARCH_TOOL],
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
