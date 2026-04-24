import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { ReportData, GenerateRequest, CandidateProposal } from './types'
import {
  checkAllTrademarks,
  TRADEMARK_UNAVAILABLE_NOTES,
  type TrademarkCheckResult,
  type TrademarkConflict,
} from './signa'
import { type TrademarkRisk, RISK_RANK } from './types'
import { checkAllEuipoTrademarks, shouldQueryEuipo } from './euipo'
import { checkAllDomains } from './dns'
import { isFlagEnabled } from './flags'
import { logAnthropicUsage, logProviderUsage } from './cost'
import logger from './logger'

const SONNET_MODEL = 'claude-sonnet-4-6'

// Lazy singleton — `new Anthropic()` reads ANTHROPIC_API_KEY at call time
// rather than at module load, matching the stripe.ts factory pattern so
// tests and serverless cold starts don't fail before env is wired up.
let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic()
  }
  return _client
}

// Retries the inner call once on Anthropic 429s, honouring Retry-After when
// the SDK exposes it. Capped at 60s so we never block a request beyond a
// reasonable user-facing latency budget.
async function callWithRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: { requestId?: string; step: string }
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof Anthropic.RateLimitError)) throw err
    // SDK's `headers` is `Headers | undefined`; access via `.get` when available,
    // fall back to record-style indexing for the test mock that uses a plain object.
    const headers = err.headers as Headers | Record<string, string> | undefined
    const retryAfterRaw =
      headers && typeof (headers as Headers).get === 'function'
        ? (headers as Headers).get('retry-after')
        : (headers as Record<string, string> | undefined)?.['retry-after']
    const retryAfter = Number(retryAfterRaw)
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : 30_000
    logger.warn(
      { requestId: opts.requestId, step: opts.step, delayMs },
      'rate limited — retrying once'
    )
    await new Promise((r) => setTimeout(r, delayMs))
    return await fn()
  }
}

const VALID_STYLES = new Set(['descriptive', 'invented', 'metaphorical', 'acronym', 'compound'])
const VALID_RISKS = new Set(['low', 'moderate', 'high', 'uncertain'])
const VALID_DOMAIN_STATUS = new Set(['available', 'taken', 'likely taken', 'uncertain'])

// Nice Class 42: computer software and SaaS services. Used as a fallback when
// inference fails — most of our traffic is software but the inference step
// catches non-software briefs (coffee shops, agencies, hardware, etc.).
const NICE_CLASS_SOFTWARE = 42
const VALID_NICE_CLASSES = new Set(Array.from({ length: 45 }, (_, i) => i + 1))

// LD flag gating the parallel EUIPO direct cross-check on top of Signa.
const EUIPO_CROSS_CHECK_FLAG = 'euipo-direct-cross-check'

// Conflict-first merge: if any source flags a real risk, the candidate inherits
// the worst risk. Both clean → "cross-verified low". Both uncertain → uncertain.
// Sources that disagree on a concrete result get the worst risk plus a
// disagreement note so the LLM can surface it to the user.
// Dedupe conflicts by mark text + office + registration number so a hit found
// by both sources only appears once in the merged report.
function dedupeConflicts(conflicts: TrademarkConflict[]): TrademarkConflict[] {
  const seen = new Set<string>()
  const out: TrademarkConflict[] = []
  for (const c of conflicts) {
    const key = `${c.markText.toLowerCase()}|${c.office}|${c.registrationNumber ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

export function mergeTrademarkResults(
  signa: TrademarkCheckResult,
  euipo: TrademarkCheckResult
): TrademarkCheckResult {
  const candidateName = signa.candidateName || euipo.candidateName

  if (signa.risk === 'uncertain' && euipo.risk === 'uncertain') {
    return {
      candidateName,
      risk: 'uncertain',
      notes: 'Trademark searches across Signa and EUIPO were both unavailable.',
      sources: [],
      conflicts: [],
    }
  }

  const worstRisk: TrademarkRisk =
    RISK_RANK[signa.risk] >= RISK_RANK[euipo.risk] ? signa.risk : euipo.risk

  const concreteNotes: string[] = []
  if (signa.sources.length > 0) concreteNotes.push(signa.notes)
  if (euipo.sources.length > 0) concreteNotes.push(euipo.notes)

  const sources = [...signa.sources, ...euipo.sources]
  const conflicts = dedupeConflicts([...signa.conflicts, ...euipo.conflicts])
  const crossVerifiedClean = signa.risk === 'low' && euipo.risk === 'low'
  const sourcesDisagree =
    signa.risk !== 'uncertain' && euipo.risk !== 'uncertain' && signa.risk !== euipo.risk

  // Surface single-source-only coverage so the user knows the risk grade
  // reflects partial data (one registry call failed). Asymmetric: we only
  // run EUIPO for EU/Global geos, so "Signa-only" is the more common case.
  const signaOnly = signa.risk !== 'uncertain' && euipo.risk === 'uncertain'
  const euipoOnly = euipo.risk !== 'uncertain' && signa.risk === 'uncertain'

  let prefix = ''
  if (crossVerifiedClean) {
    prefix = 'Cross-verified clear across Signa + EUIPO. '
  } else if (sourcesDisagree) {
    prefix = `Sources disagree (Signa: ${signa.risk}, EUIPO: ${euipo.risk}); using worst-case. `
  } else if (signaOnly) {
    prefix = 'EUIPO check unavailable; risk reflects Signa-only data. '
  } else if (euipoOnly) {
    prefix = 'Signa check unavailable; risk reflects EUIPO-only data. '
  }

  return {
    candidateName,
    risk: worstRisk,
    notes: prefix + concreteNotes.join(' '),
    sources,
    conflicts,
  }
}

// Build a map of merged trademark results by running Signa and (if the LD flag
// is on AND the user's geography includes EU/UK) EUIPO in parallel. Falls back
// to Signa-only when the flag is off, LD is unreachable, or geography excludes
// EU.
async function checkAllTrademarksWithCrossSource(
  proposals: CandidateProposal[],
  niceClass: number,
  geography: string,
  requestId: string
): Promise<Map<string, TrademarkCheckResult>> {
  const flagOn = await isFlagEnabled(EUIPO_CROSS_CHECK_FLAG, { key: requestId }, false)
  const useEuipo = flagOn && shouldQueryEuipo(geography)
  if (!useEuipo) {
    return checkAllTrademarks(proposals, niceClass, geography)
  }

  const [signaResult, euipoResult] = await Promise.allSettled([
    checkAllTrademarks(proposals, niceClass, geography),
    checkAllEuipoTrademarks(proposals, niceClass),
  ])

  const signaMap =
    signaResult.status === 'fulfilled' ? signaResult.value : new Map<string, TrademarkCheckResult>()
  const euipoMap =
    euipoResult.status === 'fulfilled' ? euipoResult.value : new Map<string, TrademarkCheckResult>()

  if (signaResult.status === 'rejected') {
    logger.warn(
      { requestId, upstream: 'signa', ...upstreamFields(signaResult.reason) },
      'Signa batch failed during cross-check'
    )
  }
  if (euipoResult.status === 'rejected') {
    logger.warn(
      { requestId, upstream: 'euipo', ...upstreamFields(euipoResult.reason) },
      'EUIPO batch failed during cross-check'
    )
  }

  const uncertainFor = (name: string): TrademarkCheckResult => ({
    candidateName: name,
    risk: 'uncertain',
    notes: TRADEMARK_UNAVAILABLE_NOTES,
    sources: [],
    conflicts: [],
  })

  return new Map(
    proposals.map((p) => {
      const signa = signaMap.get(p.name) ?? uncertainFor(p.name)
      const euipo = euipoMap.get(p.name) ?? uncertainFor(p.name)
      return [p.name, mergeTrademarkResults(signa, euipo)]
    })
  )
}

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
  throw err
}

export type PipelineStage =
  | 'generate-candidates'
  | 'synthesise-report'
  | 'trademark-verification'
  | 'domain-verification'

// Attach a `stage` property to an error so the route boundary can log which
// pipeline phase failed when a 502 fires. Non-enumerable-free so JSON stringify
// sees it; preserves `instanceof Anthropic.RateLimitError` checks downstream.
function tagStage(stage: PipelineStage, err: unknown): unknown {
  if (err && typeof err === 'object' && !('stage' in err)) {
    try {
      Object.defineProperty(err, 'stage', { value: stage, enumerable: true })
    } catch {
      // frozen object — fall back to wrapping
      const wrapped = new Error(err instanceof Error ? err.message : String(err)) as Error & {
        stage: PipelineStage
        cause: unknown
      }
      wrapped.stage = stage
      wrapped.cause = err
      return wrapped
    }
  }
  return err
}

export function getErrorStage(err: unknown): PipelineStage | undefined {
  if (err && typeof err === 'object' && 'stage' in err) {
    return (err as { stage: PipelineStage }).stage
  }
  return undefined
}

// Flattens an upstream-tagged error (Signa / EUIPO) into log fields so
// operators can filter by HTTP status without regexing the message string.
function upstreamFields(reason: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    err: reason instanceof Error ? reason.message : String(reason),
  }
  if (reason && typeof reason === 'object') {
    const r = reason as { status?: number; phase?: string }
    if (typeof r.status === 'number') out.status = r.status
    if (typeof r.phase === 'string') out.phase = r.phase
  }
  return out
}

// Strips trailing punctuation/whitespace from LLM-generated names so that
// `${name}.${tld}` doesn't render as e.g. "quorient..com". NFKC normalizes
// compatibility-equivalent Unicode forms (e.g. full-width Latin to ASCII).
function normalizeCandidateName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[.,!?;:\s]+$/, '')
    .trim()
}

// Catches scripts whose glyphs visually mimic Latin (homoglyph attacks) but
// allows legitimate European diacritics (ç, é, ñ, ü, ø, æ, etc.) used in real
// brand names — Provençal, Crème, Biergarten. The previous strict
// `[^\x20-\x7E]` regex 502'd the pipeline on any French/Spanish/Italian name.
//
// Blocked ranges:
//   U+0370–U+03FF   Greek (α, ε, ο, ρ look like Latin a, e, o, p)
//   U+0400–U+052F   Cyrillic + Supplement (а, е, о, р, с identical to Latin)
//   U+2000–U+206F   General Punctuation (zero-width joiners, fancy dashes)
//   U+2100–U+214F   Letterlike Symbols (ℓ, ℎ, ℯ)
//   U+2600–U+27BF   Misc Symbols + Dingbats (★, ✓, ✿)
//   U+FF00–U+FFEF   Halfwidth/Fullwidth (ＡＢＣ)
//   U+1D400–U+1D7FF Mathematical Alphanumeric (𝐚, 𝑎, 𝒂)
//   U+1F300–U+1FAFF Emoji (🚀, ☕, etc.)
const HOMOGLYPH_RE = new RegExp(
  '[\\u0370-\\u03FF\\u0400-\\u052F\\u2000-\\u206F\\u2100-\\u214F\\u2600-\\u27BF\\uFF00-\\uFFEF]' +
    '|[\\u{1D400}-\\u{1D7FF}]' +
    '|[\\u{1F300}-\\u{1FAFF}]',
  'u'
)

function validateCandidateBase(c: unknown, i: number): void {
  if (!c || typeof c !== 'object') throw new Error(`candidates[${i}] is not an object`)
  const candidate = c as Record<string, unknown>
  if (typeof candidate.name !== 'string' || !candidate.name)
    throw new Error(`candidates[${i}].name missing`)
  candidate.name = normalizeCandidateName(candidate.name)
  if (!candidate.name) throw new Error(`candidates[${i}].name empty after normalization`)
  if (HOMOGLYPH_RE.test(candidate.name as string))
    throw new Error(
      `candidates[${i}].name contains a homoglyph-prone script (Cyrillic/Greek/etc.): ${candidate.name}`
    )
  if (!VALID_STYLES.has(candidate.style as string))
    throw new Error(`candidates[${i}].style invalid: ${candidate.style}`)
  if (typeof candidate.rationale !== 'string' || !candidate.rationale)
    throw new Error(`candidates[${i}].rationale missing`)
}

// Required prefix the synthesise prompt instructs the LLM to attach to
// rationales of unusable candidates (all TLDs taken/likely-taken). The
// validator below enforces it — keeping these strings in sync.
const UNUSABLE_PREFIX = 'Domain unavailable — naming inspiration only.'
const TAKEN_STATUSES = new Set(['taken', 'likely taken'])

function isUnusableCandidate(c: { domains: { tlds: Record<string, string> } }): boolean {
  const statuses = Object.values(c.domains.tlds)
  if (statuses.length === 0) return false
  return statuses.every((s) => TAKEN_STATUSES.has(s))
}

// Cross-cutting invariants enforced after per-candidate validation.
// Auto-fix approach: the LLM violates ranking rules ~10-20% of the time.
// Throwing would 502 those requests — worse UX than the original bug.
// Instead we correct the output in place and emit a `warn` so drift is
// visible in observability.
//
// Non-fixable violations (name mismatch) still throw — they indicate real
// LLM breakage that auto-correction can't heal.
function validateReportInvariants(d: {
  candidates: Array<{
    name: string
    rationale: string
    domains: { tlds: Record<string, string> }
  }>
  topPicks: Array<{ name: string; reasoning: string; nextSteps: string }>
}): void {
  // (1) Name-integrity check. Can't auto-fix — the LLM emitted a name that
  // doesn't exist in candidates[], so we don't know what they meant. Throw.
  const candidateNames = new Set(d.candidates.map((c) => c.name))
  for (const [i, p] of d.topPicks.entries()) {
    if (!candidateNames.has(p.name)) {
      throw new Error(`topPicks[${i}].name "${p.name}" does not match any candidate name`)
    }
  }

  // (2) Prefix fix: prepend UNUSABLE_PREFIX to any unusable candidate whose
  // rationale is missing it. Idempotent — already-prefixed rationales stay as-is.
  for (const c of d.candidates) {
    if (isUnusableCandidate(c) && !c.rationale.startsWith(UNUSABLE_PREFIX)) {
      logger.warn(
        { name: c.name, event: 'auto_fix_unusable_prefix' },
        'auto-fixed missing unusable prefix on candidate rationale'
      )
      c.rationale = `${UNUSABLE_PREFIX} ${c.rationale}`
    }
  }

  // (3) Ranking fix: stable partition so unusable candidates move to the
  // bottom while preserving LLM-intended order within each group. We only
  // rewrite candidates[] if a reorder actually happened.
  const usable = d.candidates.filter((c) => !isUnusableCandidate(c))
  const unusable = d.candidates.filter((c) => isUnusableCandidate(c))
  const reordered = [...usable, ...unusable]
  const orderChanged = reordered.some((c, i) => c !== d.candidates[i])
  if (orderChanged) {
    logger.warn(
      {
        event: 'auto_fix_ranking',
        usableCount: usable.length,
        unusableCount: unusable.length,
      },
      'auto-fixed candidate ranking — unusable candidates moved to bottom'
    )
    d.candidates.length = 0
    d.candidates.push(...reordered)
  }

  // (4) topPicks fix: drop any unusable entries. If this leaves <3 picks
  // we accept the shorter list rather than manufacture a replacement — the
  // LLM's "reasoning" and "nextSteps" are specific to each name, can't
  // synthesize a new one.
  const unusableNames = new Set(unusable.map((c) => c.name))
  const filteredTopPicks = d.topPicks.filter((p) => !unusableNames.has(p.name))
  if (filteredTopPicks.length !== d.topPicks.length) {
    const removed = d.topPicks.filter((p) => unusableNames.has(p.name)).map((p) => p.name)
    logger.warn(
      { event: 'auto_fix_toppicks', removed },
      'auto-fixed topPicks — removed unusable candidates'
    )
    d.topPicks.length = 0
    d.topPicks.push(...filteredTopPicks)
  }
}

export function validateReportData(data: unknown): ReportData {
  if (!data || typeof data !== 'object') throw new Error('Report is not an object')
  const d = data as Record<string, unknown>

  if (typeof d.summary !== 'string' || !d.summary) throw new Error('Missing or invalid summary')
  if (typeof d.recommendation !== 'string') throw new Error('Missing recommendation')
  if (!Array.isArray(d.candidates) || d.candidates.length === 0)
    throw new Error('candidates must be a non-empty array')
  if (!Array.isArray(d.topPicks)) throw new Error('topPicks must be an array')

  for (const [i, p] of (d.topPicks as unknown[]).entries()) {
    if (!p || typeof p !== 'object') throw new Error(`topPicks[${i}] is not an object`)
    const pick = p as Record<string, unknown>
    if (typeof pick.name !== 'string' || !pick.name)
      throw new Error(`topPicks[${i}].name missing or invalid`)
    // Normalize the same way candidate names are normalized (trailing punct,
    // NFKC) so cross-reference checks downstream don't fail on cosmetic drift.
    pick.name = normalizeCandidateName(pick.name)
    if (!pick.name) throw new Error(`topPicks[${i}].name empty after normalization`)
    if (typeof pick.reasoning !== 'string' || !pick.reasoning)
      throw new Error(`topPicks[${i}].reasoning missing or invalid`)
    if (typeof pick.nextSteps !== 'string' || !pick.nextSteps)
      throw new Error(`topPicks[${i}].nextSteps missing or invalid`)
  }

  for (const [i, c] of (d.candidates as unknown[]).entries()) {
    validateCandidateBase(c, i)
    const candidate = c as Record<string, unknown>
    if (!VALID_RISKS.has(candidate.trademarkRisk as string))
      throw new Error(`candidates[${i}].trademarkRisk invalid: ${candidate.trademarkRisk}`)
    if (typeof candidate.trademarkNotes !== 'string')
      throw new Error(`candidates[${i}].trademarkNotes missing`)
    const domains = candidate.domains as Record<string, unknown>
    if (!domains || typeof domains !== 'object') throw new Error(`candidates[${i}].domains missing`)
    const tldMap = domains.tlds as Record<string, unknown>
    if (!tldMap || typeof tldMap !== 'object')
      throw new Error(`candidates[${i}].domains.tlds missing`)
    // The model sometimes returns TLD keys with a leading dot (".com"); strip so
    // the renderer's `${name}.${tld}` doesn't produce "brieflog..com".
    const normalizedTlds: Record<string, unknown> = {}
    for (const [tld, status] of Object.entries(tldMap)) {
      if (!VALID_DOMAIN_STATUS.has(status as string))
        throw new Error(`candidates[${i}].domains.tlds.${tld} invalid: ${status}`)
      normalizedTlds[tld.replace(/^\.+/, '')] = status
    }
    domains.tlds = normalizedTlds
    if (!Array.isArray(domains.alternates))
      throw new Error(`candidates[${i}].domains.alternates missing`)
  }

  // Cross-cutting invariants (ranking, prefix, topPicks integrity) — must
  // run after the per-candidate loop has narrowed types and normalized TLDs.
  validateReportInvariants(
    d as unknown as {
      candidates: Array<{
        name: string
        rationale: string
        domains: { tlds: Record<string, string> }
      }>
      topPicks: Array<{ name: string; reasoning: string; nextSteps: string }>
    }
  )

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

const NICE_CLASS_INFERENCE_PROMPT = `You are a trademark filing specialist. Identify the single most relevant Nice Classification (1-45) for the product described, the class an applicant would file under to register a brand name for it.

Common picks:
- Class 9: downloadable software, mobile apps, computer hardware
- Class 25: clothing, footwear, headgear
- Class 30: coffee, tea, baked goods, packaged food
- Class 35: retail services, advertising, business consulting
- Class 36: financial services, insurance, real estate
- Class 41: education, entertainment, training
- Class 42: SaaS, software-as-a-service, IT consulting, technology platforms
- Class 43: restaurants, cafes, hotels
- Class 44: health and beauty services, medical, agricultural
- Class 45: legal services, security services, dating services

Respond with only a single integer between 1 and 45. No explanation, no JSON, no other characters.`

// Result of Nice class inference. `confidence` lets downstream surfaces
// (synthesise prompt, user-facing notes) flag when the call fell back to the
// default class so the user knows to verify before filing (P1 #8 audit).
export interface NiceClassResult {
  value: number
  confidence: 'inferred' | 'fallback'
}

export async function inferNiceClass(
  req: GenerateRequest,
  opts: { requestId?: string } = {}
): Promise<NiceClassResult> {
  try {
    const response = await client().messages.create({
      model: SONNET_MODEL,
      max_tokens: 10,
      system: NICE_CLASS_INFERENCE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Product description: ${req.description}\n\nPrimary market: ${req.geography}`,
        },
      ],
    })
    logAnthropicUsage({
      requestId: opts.requestId,
      step: 'infer-nice-class',
      model: SONNET_MODEL,
      usage: response.usage,
    })

    const text = extractText(response.content).trim()
    const parsed = parseInt(text, 10)
    if (Number.isFinite(parsed) && VALID_NICE_CLASSES.has(parsed)) {
      return { value: parsed, confidence: 'inferred' }
    }
    logger.warn({ text }, 'Nice class inference returned non-numeric — falling back to 42')
    return { value: NICE_CLASS_SOFTWARE, confidence: 'fallback' }
  } catch (err) {
    // Inference is non-critical — failing here would block the whole pipeline.
    // Fall back to the software default and let the pipeline continue.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Nice class inference failed — falling back to 42'
    )
    return { value: NICE_CLASS_SOFTWARE, confidence: 'fallback' }
  }
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
- Exclude names that would be unregisterable as trademarks:
  - No names whose primary meaning describes what the product does or the category it belongs to (e.g. "FastPay" for a payment app, "CloudStore" for cloud storage) — trademark offices refuse these as merely descriptive. Note: "descriptive" as a naming style means evocative or suggestive, not literal; a name that hints at a benefit is registerable, a name that states the function is not.
  - No laudatory terms used alone (e.g. "Best", "Premium", "Superior", "Elite") — trademark offices refuse these as merely self-congratulatory
  - No names that are, or closely resemble, the name of a real living or deceased person — these require consent and are routinely refused without it
  - No corporate suffixes appended to the name (e.g. "Verity Inc", "Acmely LLC") — the suffix is disclaimed in trademark filings and adds no protectable value; the brand name alone is what gets registered
- Treat the constraints field as hard requirements. Every candidate must satisfy them (e.g. "max 6 characters" eliminates any name longer than 6 characters; "no acronyms" eliminates the acronym style entirely). If a constraint is contradictory or impossible, do not attempt it — instead generate the best candidates you can and note the conflict in the rationale of affected names.
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

export async function generateCandidates(
  req: GenerateRequest,
  opts: { requestId?: string } = {}
): Promise<CandidateProposal[]> {
  const userMessage = `Product: ${req.description}
Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none'}
Primary market: ${req.geography}

Generate brand name candidates as a JSON array.`

  try {
    const response = await callWithRateLimitRetry(
      () =>
        client().messages.create({
          model: SONNET_MODEL,
          max_tokens: 3000,
          system: GENERATE_CANDIDATES_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      { requestId: opts.requestId, step: 'generate-candidates' }
    )

    const text = extractText(response.content)
    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    logAnthropicUsage({
      requestId: opts.requestId,
      step: 'generate-candidates',
      model: SONNET_MODEL,
      usage: response.usage,
    })
    return parseProposals(text)
  } catch (err) {
    rethrowAnthropicError(err)
  }
}

interface VerifiedCandidate extends CandidateProposal {
  trademark: TrademarkCheckResult
  domains: import('./types').DomainAvailability
}

// Extracts the cross-source coverage prefix (Cross-verified / Sources disagree /
// EUIPO unavailable / Signa-only) that mergeTrademarkResults attaches to the
// front of `notes`. Returns null if no coverage prefix is present (e.g. when
// only one source ran). Single source of truth for both producers and
// consumers of the prefix — keep the patterns aligned with mergeTrademarkResults.
function extractCoverageNote(notes: string): string | null {
  const patterns = [
    /^Cross-verified clear[^.]*\./,
    /^Sources disagree[^.]*\./,
    /^EUIPO check unavailable[^.]*\./,
    /^Signa check unavailable[^.]*\./,
    /^Trademark searches across Signa and EUIPO were both unavailable\./,
  ]
  for (const re of patterns) {
    const m = notes.match(re)
    if (m) return m[0]
  }
  return null
}

const SYNTHESISE_REPORT_PROMPT = `You are a brand strategy expert. You have been given a list of brand name candidates with trademark search results and real domain availability data. Produce a final brand name report.

# Instructions
- Assess trademark risk using the data provided. When conflicts are listed, cite specific marks by name in trademarkNotes — include the mark text and at least one identifying detail (registration number, office, or class). When no conflicts are listed, state that clearly. Do NOT invent marks that are not in the provided conflict data.
- When the data includes a "Coverage note:" line, you MUST preserve its meaning verbatim at the START of trademarkNotes for that candidate. Examples: "Cross-verified clear across Signa + EUIPO." (both registries returned no live conflicts), "Sources disagree (Signa: high, EUIPO: low); using worst-case." (registry results conflict), or "EUIPO check unavailable; risk reflects Signa-only data." (one source failed). This tells the user how confident the risk grade is.
- Use only the trademarkRisk value provided in the data — do not re-bucket it.
- Copy domain status values exactly as provided — do not alter them.
- For each TLD marked as "taken" or "likely taken", suggest 2-3 creative alternate domain strings (e.g. getbrandname.com, trybrandname.io). Leave "alternates" as an empty array if no TLD is taken or likely taken.
- Select the 3 candidates with the best combined trademark safety and domain availability as topPicks. If fewer than 3 candidates are clearly defensible, include only those that are and explain the constraint in "reasoning".
- A candidate is **unusable** if EVERY TLD status is "taken" or "likely taken" (zero available/uncertain TLDs). Unusable candidates:
  - MUST be ranked at the bottom of the candidates array.
  - MUST have their rationale prefixed with exactly: "Domain unavailable — naming inspiration only. " followed by the normal 2-3 sentence rationale.
  - MUST NEVER appear in topPicks, regardless of trademark safety or strategic fit.
- Rank the full candidates array from most to least viable. Viability is determined by this priority order: (1) usability — unusable candidates always rank last; (2) trademark risk — low beats moderate beats uncertain beats high; (3) domain availability — more confirmed-available TLDs beats more uncertain TLDs beats more taken TLDs (never treat "uncertain" as a positive signal, it means we couldn't confirm); (4) strategic fit with the brand personality.
- Write actionable nextSteps for each topPick. Scope is limited to trademark and domain actions only — e.g. "File USPTO application in Nice Class 42", "Register acmely.io immediately", "Commission a clearance search before filing". Do not include marketing, product, or business advice.

# Output
Respond with ONLY a valid JSON object. No markdown, no preamble.
Valid values for "style": "descriptive", "invented", "metaphorical", "acronym", "compound".
Valid values for "trademarkRisk": "low", "moderate", "high", "uncertain".
Valid values for domain TLDs: "available", "taken", "likely taken", "uncertain".

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
        "tlds": {
          "<each TLD exactly as provided in the candidate data>": "one of the four domain status values"
        },
        "alternates": ["string — only for TLDs that are taken or likely taken"]
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
  verified: VerifiedCandidate[],
  opts: { requestId?: string; niceClassConfidence?: 'inferred' | 'fallback' } = {}
): Promise<ReportData> {
  const candidateLines = verified
    .map((v) => {
      const domainLines = Object.entries(v.domains.tlds)
        .map(([tld, status]) => `TLD ${tld}: ${status}`)
        .join('\n')
      const conflictLines =
        v.trademark.conflicts.length === 0
          ? 'Conflicts: none found in queried offices.'
          : `Conflicts (cite these by name in trademarkNotes if relevant):\n${v.trademark.conflicts
              .slice(0, 5)
              .map((c) => {
                const status = c.isLive ? 'live' : 'dead'
                const reg = c.registrationNumber ? ` reg #${c.registrationNumber}` : ''
                return `  - "${c.markText}" (${c.office.toUpperCase()}, ${status}, Class ${c.niceClasses.join('/')},${reg} owner: ${c.ownerName ?? 'unknown'})`
              })
              .join('\n')}`
      const sources =
        v.trademark.sources.length > 0 ? v.trademark.sources.join(', ') : 'none (search degraded)'
      // Surface the cross-source verification status so the LLM can preserve
      // it in trademarkNotes — without this the "Cross-verified clear" /
      // "Sources disagree" / "EUIPO unavailable" signal computed by
      // mergeTrademarkResults is silently discarded (accuracy audit P0 #3).
      const coverageNote = extractCoverageNote(v.trademark.notes)
      const coverageLine = coverageNote ? `Coverage note: ${coverageNote}\n` : ''
      return `Name: ${v.name}
Style: ${v.style}
Rationale: ${v.rationale}
Trademark risk (precomputed): ${v.trademark.risk}
Sources queried: ${sources}
${coverageLine}${conflictLines}
${domainLines}`
    })
    .join('\n\n---\n\n')

  const niceClassCaveat =
    opts.niceClassConfidence === 'fallback'
      ? '\n\nIMPORTANT: Nice class inference fell back to the default (Class 42 — software/SaaS). If the product is NOT software, advise the user in the recommendation field to confirm the correct Nice class with a trademark attorney before filing, since the trademark search results above may not reflect the right class.'
      : ''

  const userMessage = `Product: ${req.description}
Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none'}
Primary market: ${req.geography}${niceClassCaveat}

Verified candidates:

${candidateLines}

Produce the final brand name report as JSON.`

  try {
    const response = await callWithRateLimitRetry(
      () =>
        client().messages.create({
          model: SONNET_MODEL,
          max_tokens: 6000,
          system: SYNTHESISE_REPORT_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      { requestId: opts.requestId, step: 'synthesise-report' }
    )

    const text = extractText(response.content)
    if (!text) throw new Error('Model returned no text block — likely ended on a tool call')

    logAnthropicUsage({
      requestId: opts.requestId,
      step: 'synthesise-report',
      model: SONNET_MODEL,
      usage: response.usage,
    })
    return parseReport(text)
  } catch (err) {
    rethrowAnthropicError(err)
  }
}

export async function generateReport(
  req: GenerateRequest,
  opts: { requestId?: string } = {}
): Promise<ReportData> {
  const tlds = req.tlds?.length ? req.tlds : ['com', 'io', 'co']
  const reqWithTlds = { ...req, tlds }
  const requestId = opts.requestId ?? randomUUID()

  // Step 1: candidate generation and Nice class inference run in parallel.
  // Both depend only on the brief, neither depends on the other, and
  // inference is cheap (~500ms) so the merged latency is dominated by
  // generateCandidates. inferNiceClass never throws — it falls back to 42.
  let proposals: CandidateProposal[]
  let niceClassResult: NiceClassResult
  try {
    ;[proposals, niceClassResult] = await Promise.all([
      generateCandidates(reqWithTlds, { requestId }),
      inferNiceClass(reqWithTlds, { requestId }),
    ])
  } catch (err) {
    throw tagStage('generate-candidates', err)
  }
  const niceClass = niceClassResult.value
  logger.info(
    { requestId, niceClass, niceClassConfidence: niceClassResult.confidence },
    'inferred Nice class for trademark search'
  )

  logProviderUsage({
    requestId,
    provider: 'signa',
    calls: proposals.length,
    notes: 'one search per candidate',
  })
  if (await isFlagEnabled(EUIPO_CROSS_CHECK_FLAG, { key: requestId }, false)) {
    if (shouldQueryEuipo(req.geography)) {
      logProviderUsage({
        requestId,
        provider: 'euipo-direct',
        calls: proposals.length,
        notes: 'parallel cross-check via LD flag',
      })
    }
  }
  logProviderUsage({
    requestId,
    provider: 'dns-lookup',
    calls: proposals.length * tlds.length,
    notes: '3-layer aggregation (DNS+RDAP+WhoisJSON) per candidate × tld',
  })

  let trademarkMap: Map<string, TrademarkCheckResult> = new Map()
  let domainMap: Map<string, import('./types').DomainAvailability> = new Map()

  // Run trademark (Signa, optionally + EUIPO via LD flag + geography gating)
  // and domain checks in parallel — independent I/O, fail open on either
  const [trademarkResult, domainResult] = await Promise.allSettled([
    checkAllTrademarksWithCrossSource(proposals, niceClass, req.geography, requestId),
    checkAllDomains(proposals, tlds),
  ])

  if (trademarkResult.status === 'fulfilled') {
    trademarkMap = trademarkResult.value
  } else {
    logger.warn(
      { requestId, ...upstreamFields(trademarkResult.reason) },
      'trademark verification failed — degrading to uncertain'
    )
  }

  if (domainResult.status === 'fulfilled') {
    domainMap = domainResult.value
  } else {
    logger.warn(
      { requestId, ...upstreamFields(domainResult.reason) },
      'domain verification failed — degrading to uncertain'
    )
  }

  if (trademarkResult.status === 'rejected' && domainResult.status === 'rejected') {
    throw tagStage(
      'trademark-verification',
      new Error(
        'Both trademark and domain verification failed. Report cannot be generated without research data.'
      )
    )
  }

  const verified: VerifiedCandidate[] = proposals.map((p) => ({
    ...p,
    trademark: trademarkMap.get(p.name) ?? {
      candidateName: p.name,
      risk: 'uncertain' as const,
      notes: TRADEMARK_UNAVAILABLE_NOTES,
      sources: [],
      conflicts: [],
    },
    domains: domainMap.get(p.name) ?? {
      tlds: Object.fromEntries(tlds.map((tld) => [tld, 'uncertain' as const])),
      alternates: [],
    },
  }))

  try {
    return await synthesiseReport(reqWithTlds, verified, {
      requestId,
      niceClassConfidence: niceClassResult.confidence,
    })
  } catch (err) {
    throw tagStage('synthesise-report', err)
  }
}
