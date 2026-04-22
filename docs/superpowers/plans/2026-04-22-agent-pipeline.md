# Agent Pipeline (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Anthropic call with a three-step verified pipeline: generate candidate names → parallel Signa trademark + DNS domain checks → synthesise final report with real data.

**Architecture:** `generateReport` becomes an orchestrator. Step 1 (new `generateCandidates`) produces `CandidateProposal[]` with no tools. Step 2 fans out `checkAllTrademarks` and `checkAllDomains` in parallel via `Promise.all`. Step 3 (new `synthesiseReport`) receives verified data and produces the final `ReportData`. The API surface (`/api/generate`) and output schema are unchanged.

**Tech Stack:** `@anthropic-ai/sdk` (existing), `@signa-so/sdk` (existing), Node.js `dns/promises` (built-in, no new dependency), Jest for tests.

---

## File Map

| File                                  | Change                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/types.ts`                    | Add `CandidateProposal` interface                                                                                                            |
| `src/lib/anthropic.ts`                | Add `parseProposals`, `generateCandidates`, `synthesiseReport`; refactor `generateReport` to orchestrator; remove old `SYSTEM_PROMPT` export |
| `src/lib/dns.ts`                      | New: `checkDomain`, `checkAllDomains`                                                                                                        |
| `src/lib/signa.ts`                    | Update `checkAllTrademarks` signature: `Candidate[]` → `{ name: string }[]`                                                                  |
| `src/__tests__/lib/anthropic.test.ts` | Add tests for `parseProposals`, `generateCandidates`, `synthesiseReport`, `generateReport` orchestration                                     |
| `src/__tests__/lib/dns.test.ts`       | New: tests for `checkAllDomains`                                                                                                             |

---

## Task 1: Add `CandidateProposal` type

**Files:**

- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the interface**

Open `src/lib/types.ts` and add after the `DomainAvailability` interface:

```typescript
export interface CandidateProposal {
  name: string
  style: 'descriptive' | 'invented' | 'metaphorical' | 'acronym' | 'compound'
  rationale: string
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add CandidateProposal type for pipeline step 1"
```

---

## Task 2: `parseProposals` function

**Files:**

- Modify: `src/lib/anthropic.ts`
- Modify: `src/__tests__/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/__tests__/lib/anthropic.test.ts`:

```typescript
import { parseReport, parseProposals } from '@/lib/anthropic'

// existing parseReport tests stay unchanged above

const VALID_PROPOSALS = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Strategic rationale here.',
}))

describe('parseProposals', () => {
  it('parses a valid JSON array', () => {
    const result = parseProposals(JSON.stringify(VALID_PROPOSALS))
    expect(result).toHaveLength(8)
    expect(result[0].name).toBe('Brand0')
    expect(result[0].style).toBe('invented')
  })

  it('strips markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID_PROPOSALS)}\n\`\`\``
    expect(parseProposals(fenced)).toHaveLength(8)
  })

  it('extracts array from surrounding text', () => {
    const wrapped = `Here are the candidates: ${JSON.stringify(VALID_PROPOSALS)} done.`
    expect(parseProposals(wrapped)).toHaveLength(8)
  })

  it('throws when fewer than 5 candidates returned', () => {
    const tooFew = VALID_PROPOSALS.slice(0, 3)
    expect(() => parseProposals(JSON.stringify(tooFew))).toThrow('Too few candidates: 3')
  })

  it('throws when no array found', () => {
    expect(() => parseProposals('not an array at all')).toThrow('No JSON array found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: FAIL — `parseProposals is not exported`

- [ ] **Step 3: Implement `parseProposals`**

Add to `src/lib/anthropic.ts` after the `parseReport` function:

````typescript
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
````

Also add `CandidateProposal` to the import at the top of `anthropic.ts`:

```typescript
import type { ReportData, GenerateRequest, CandidateProposal } from './types'
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: all `parseProposals` tests PASS, existing `parseReport` tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anthropic.ts src/__tests__/lib/anthropic.test.ts src/lib/types.ts
git commit -m "feat: add parseProposals for pipeline step 1 output"
```

---

## Task 3: `generateCandidates` function

**Files:**

- Modify: `src/lib/anthropic.ts`
- Modify: `src/__tests__/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Add at the top of `src/__tests__/lib/anthropic.test.ts`, before any imports:

```typescript
let mockCreate: jest.Mock

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn().mockImplementation(() => ({
      messages: { create: (...args: unknown[]) => mockCreate(...args) },
    })),
    {
      RateLimitError: class RateLimitError extends Error {
        status = 429
      },
      AuthenticationError: class AuthenticationError extends Error {
        status = 401
      },
      APIError: class APIError extends Error {
        status: number
        constructor(s: number, m: string) {
          super(m)
          this.status = s
        }
      },
    }
  ),
}))
```

Then add this describe block at the bottom of `src/__tests__/lib/anthropic.test.ts`:

```typescript
import { parseReport, parseProposals, generateCandidates } from '@/lib/anthropic'

const MOCK_PROPOSALS = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented',
  rationale: 'Good rationale.',
}))

function makeTextResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

describe('generateCandidates', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
  })

  it('returns CandidateProposal[] on success', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_PROPOSALS)))

    const result = await generateCandidates({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(result).toHaveLength(8)
    expect(result[0].name).toBe('Brand0')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6', tools: undefined })
    )
  })

  it('throws when model returns fewer than 5 candidates', async () => {
    const tooFew = MOCK_PROPOSALS.slice(0, 3)
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(tooFew)))

    await expect(
      generateCandidates({ description: 'x', personality: 'y', constraints: '', geography: 'z' })
    ).rejects.toThrow('Too few candidates')
  })

  it('throws when model returns no text block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'web_search', input: {} }],
    })

    await expect(
      generateCandidates({ description: 'x', personality: 'y', constraints: '', geography: 'z' })
    ).rejects.toThrow('no text block')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: FAIL — `generateCandidates is not exported`

- [ ] **Step 3: Implement `generateCandidates`**

Add the system prompt constant and the function to `src/lib/anthropic.ts`, after `parseProposals`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: all `generateCandidates` tests PASS, all prior tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anthropic.ts src/__tests__/lib/anthropic.test.ts
git commit -m "feat: add generateCandidates for pipeline step 1"
```

---

## Task 4: `checkAllDomains` in `dns.ts`

**Files:**

- Create: `src/lib/dns.ts`
- Create: `src/__tests__/lib/dns.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/dns.test.ts`:

```typescript
jest.mock('dns/promises', () => ({ lookup: jest.fn() }))

import { lookup } from 'dns/promises'
import { checkAllDomains } from '@/lib/dns'
import type { CandidateProposal } from '@/lib/types'

const mockLookup = lookup as jest.Mock

const CANDIDATES: CandidateProposal[] = [
  { name: 'Acmely', style: 'invented', rationale: 'Good.' },
  { name: 'Buildify', style: 'compound', rationale: 'Good.' },
]

describe('checkAllDomains', () => {
  beforeEach(() => {
    mockLookup.mockReset()
  })

  it('returns likely taken when DNS resolves', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('likely taken')
    expect(result.get('Acmely')?.io).toBe('likely taken')
    expect(result.get('Acmely')?.co).toBe('likely taken')
  })

  it('returns likely available when DNS returns ENOTFOUND', async () => {
    const err = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    mockLookup.mockRejectedValue(err)

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('likely available')
  })

  it('returns uncertain on unexpected DNS error', async () => {
    const err = Object.assign(new Error('ETIMEOUT'), { code: 'ETIMEOUT' })
    mockLookup.mockRejectedValue(err)

    const result = await checkAllDomains(CANDIDATES)
    expect(result.get('Acmely')?.com).toBe('uncertain')
  })

  it('returns results for all candidates even if one fails', async () => {
    mockLookup
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .com
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .io
      .mockResolvedValueOnce({ address: '1.2.3.4', family: 4 }) // Acmely .co
      .mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })) // all Buildify

    const result = await checkAllDomains(CANDIDATES)
    expect(result.has('Acmely')).toBe(true)
    expect(result.has('Buildify')).toBe(true)
  })

  it('lowercases and strips spaces from name for DNS lookup', async () => {
    const spaced: CandidateProposal[] = [{ name: 'My Brand', style: 'compound', rationale: 'x.' }]
    mockLookup.mockResolvedValue({ address: '1.2.3.4', family: 4 })

    await checkAllDomains(spaced)
    expect(mockLookup).toHaveBeenCalledWith('mybrand.com')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=dns --forceExit
```

Expected: FAIL — `Cannot find module '@/lib/dns'`

- [ ] **Step 3: Implement `dns.ts`**

Create `src/lib/dns.ts`:

```typescript
import { lookup } from 'dns/promises'
import type { CandidateProposal, DomainAvailability } from './types'

async function checkDomain(
  hostname: string
): Promise<'likely available' | 'likely taken' | 'uncertain'> {
  try {
    await lookup(hostname)
    return 'likely taken'
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOTFOUND') return 'likely available'
    return 'uncertain'
  }
}

export async function checkAllDomains(
  candidates: CandidateProposal[]
): Promise<Map<string, DomainAvailability>> {
  const settled = await Promise.allSettled(
    candidates.map(async (c) => {
      const slug = c.name.toLowerCase().replace(/\s+/g, '')
      const [com, io, co] = await Promise.all([
        checkDomain(`${slug}.com`),
        checkDomain(`${slug}.io`),
        checkDomain(`${slug}.co`),
      ])
      const availability: DomainAvailability = { com, io, co, alternates: [] }
      return { name: c.name, availability }
    })
  )

  return new Map(
    settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return [result.value.name, result.value.availability]
      }
      const fallback: DomainAvailability = {
        com: 'uncertain',
        io: 'uncertain',
        co: 'uncertain',
        alternates: [],
      }
      return [candidates[i].name, fallback]
    })
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=dns --forceExit
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dns.ts src/__tests__/lib/dns.test.ts
git commit -m "feat: add DNS domain availability checker"
```

---

## Task 5: Update `signa.ts` signature

**Files:**

- Modify: `src/lib/signa.ts`

- [ ] **Step 1: Update `checkAllTrademarks` to accept `{ name: string }[]`**

In `src/lib/signa.ts`, change the import and the function signature:

```typescript
// Remove this import:
import type { Candidate } from './types'

// Change the function signature from:
export async function checkAllTrademarks(
  candidates: Candidate[],
  niceClass: number
): Promise<Map<string, TrademarkCheckResult>> {

// To:
export async function checkAllTrademarks(
  candidates: { name: string }[],
  niceClass: number
): Promise<Map<string, TrademarkCheckResult>> {
```

The function body is unchanged — it only accesses `c.name`.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --forceExit
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/signa.ts
git commit -m "refactor: broaden checkAllTrademarks to accept any {name} array"
```

---

## Task 6: `synthesiseReport` function

**Files:**

- Modify: `src/lib/anthropic.ts`
- Modify: `src/__tests__/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/lib/anthropic.test.ts`:

```typescript
import { parseReport, parseProposals, generateCandidates, synthesiseReport } from '@/lib/anthropic'
import type { TrademarkCheckResult } from '@/lib/signa'
import type { DomainAvailability } from '@/lib/types'

const MOCK_TRADEMARK: TrademarkCheckResult = {
  candidateName: 'Brand0',
  risk: 'low',
  notes: 'No conflicts found.',
  sources: ['Signa (USPTO + EUIPO)'],
}

const MOCK_DOMAINS: DomainAvailability = {
  com: 'likely available',
  io: 'uncertain',
  co: 'likely taken',
  alternates: [],
}

const VERIFIED = Array.from({ length: 8 }, (_, i) => ({
  name: `Brand${i}`,
  style: 'invented' as const,
  rationale: 'Good rationale.',
  trademark: { ...MOCK_TRADEMARK, candidateName: `Brand${i}` },
  domains: MOCK_DOMAINS,
}))

const MOCK_FULL_REPORT: ReportData = {
  summary: 'A SaaS tool for developers.',
  candidates: VERIFIED.map((v) => ({
    name: v.name,
    style: v.style,
    rationale: v.rationale,
    trademarkRisk: 'low',
    trademarkNotes: 'No conflicts found.',
    domains: v.domains,
  })),
  topPicks: [
    { name: 'Brand0', reasoning: 'Best option.', nextSteps: 'File USPTO application.' },
    { name: 'Brand1', reasoning: 'Second best.', nextSteps: 'Check EUIPO.' },
    { name: 'Brand2', reasoning: 'Third option.', nextSteps: 'Check domain.' },
  ],
  recommendation: 'Go with Brand0.',
}

describe('synthesiseReport', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
  })

  it('returns validated ReportData on success', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    const result = await synthesiseReport(
      {
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
      },
      VERIFIED
    )

    expect(result.candidates).toHaveLength(8)
    expect(result.topPicks).toHaveLength(3)
    expect(result.summary).toBe('A SaaS tool for developers.')
  })

  it('passes verified trademark and domain data in the user message', async () => {
    mockCreate.mockResolvedValue(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    await synthesiseReport(
      {
        description: 'A SaaS tool',
        personality: 'Bold / contrarian',
        constraints: '',
        geography: 'Global',
      },
      VERIFIED
    )

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('Brand0')
    expect(callArgs.messages[0].content).toContain('No conflicts found')
    expect(callArgs.messages[0].content).toContain('likely available')
  })

  it('throws when model returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [] })

    await expect(
      synthesiseReport(
        { description: 'x', personality: 'y', constraints: '', geography: 'z' },
        VERIFIED
      )
    ).rejects.toThrow('no text block')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: FAIL — `synthesiseReport is not exported`

- [ ] **Step 3: Implement `synthesiseReport`**

Add to `src/lib/anthropic.ts`, after `generateCandidates`. The `VerifiedCandidate` interface goes at **module scope** (not inside the function) so Task 7 can also use it:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: all `synthesiseReport` tests PASS, all prior tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anthropic.ts src/__tests__/lib/anthropic.test.ts
git commit -m "feat: add synthesiseReport for pipeline step 3"
```

---

## Task 7: Refactor `generateReport` to orchestrator

**Files:**

- Modify: `src/lib/anthropic.ts`
- Modify: `src/__tests__/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing integration test**

Add to `src/__tests__/lib/anthropic.test.ts`:

```typescript
jest.mock('@/lib/signa', () => ({
  checkAllTrademarks: jest.fn(),
}))
jest.mock('@/lib/dns', () => ({
  checkAllDomains: jest.fn(),
}))

import { checkAllTrademarks } from '@/lib/signa'
import { checkAllDomains } from '@/lib/dns'
import { generateReport } from '@/lib/anthropic'

describe('generateReport orchestrator', () => {
  beforeEach(() => {
    mockCreate = jest.fn()
    ;(checkAllTrademarks as jest.Mock).mockResolvedValue(new Map())
    ;(checkAllDomains as jest.Mock).mockResolvedValue(new Map())
  })

  it('calls generateCandidates then verification then synthesiseReport', async () => {
    // Step 1 returns proposals
    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_PROPOSALS)))
    // Step 3 returns full report
    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    const result = await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(checkAllTrademarks).toHaveBeenCalledWith(MOCK_PROPOSALS, 42)
    expect(checkAllDomains).toHaveBeenCalledWith(MOCK_PROPOSALS)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.candidates).toHaveLength(8)
  })

  it('proceeds with uncertain data when Signa and DNS both fail', async () => {
    ;(checkAllTrademarks as jest.Mock).mockRejectedValue(new Error('Signa down'))
    ;(checkAllDomains as jest.Mock).mockRejectedValue(new Error('DNS down'))

    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_PROPOSALS)))
    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(MOCK_FULL_REPORT)))

    const result = await generateReport({
      description: 'A SaaS tool',
      personality: 'Bold / contrarian',
      constraints: '',
      geography: 'Global',
    })

    expect(result.candidates).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=anthropic --forceExit
```

Expected: FAIL — orchestrator tests fail because `generateReport` still uses the old single-call implementation.

- [ ] **Step 3: Refactor `generateReport` in `src/lib/anthropic.ts`**

Replace the entire existing `generateReport` function and the `WEB_SEARCH_TOOL` constant and the old `SYSTEM_PROMPT` export with. Add the two new imports at the top of the file. The `VerifiedCandidate` interface was already added at module scope in Task 6 — do not add it again:

```typescript
// Add at top of file with other imports:
import { checkAllTrademarks } from './signa'
import { checkAllDomains } from './dns'

export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  // Step 1: Generate candidate names
  const proposals = await generateCandidates(req)

  // Step 2: Verify in parallel — fail open on total outage
  let trademarkMap: Map<string, TrademarkCheckResult> = new Map()
  let domainMap: Map<string, DomainAvailability> = new Map()

  try {
    ;[trademarkMap, domainMap] = await Promise.all([
      checkAllTrademarks(proposals, 42),
      checkAllDomains(proposals),
    ])
  } catch (err) {
    console.error('[generateReport] verification failed, proceeding with empty data:', err)
  }

  // Step 3: Merge verified data
  const verified: VerifiedCandidate[] = proposals.map((p) => ({
    ...p,
    trademark: trademarkMap.get(p.name) ?? {
      candidateName: p.name,
      risk: 'uncertain',
      notes: 'Trademark search unavailable. Manual verification recommended.',
      sources: [],
    },
    domains: domainMap.get(p.name) ?? {
      com: 'uncertain',
      io: 'uncertain',
      co: 'uncertain',
      alternates: [],
    },
  }))

  // Step 4: Synthesise final report
  return synthesiseReport(req, verified)
}
```

Also remove these lines that are no longer needed:

- `import type { WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages/messages'`
- `export const SYSTEM_PROMPT = ...` (the old single-pass prompt)
- `const WEB_SEARCH_TOOL: WebSearchTool20250305 = ...`

> **Note:** `SYSTEM_PROMPT` was exported. Check that nothing imports it before removing — run `grep -r "SYSTEM_PROMPT" src/` first. If nothing imports it, delete it.

- [ ] **Step 4: Check nothing imports SYSTEM_PROMPT**

```bash
grep -r "SYSTEM_PROMPT" src/
```

Expected: no results (it was only used internally).

- [ ] **Step 5: Run full test suite**

```bash
npm test -- --forceExit
```

Expected: all tests PASS.

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/anthropic.ts src/__tests__/lib/anthropic.test.ts
git commit -m "feat: refactor generateReport to three-step agent pipeline"
```

---

## Final Check

- [ ] **Run full test suite one last time**

```bash
npm test -- --forceExit
```

Expected: all tests pass across all 8 test suites.

- [ ] **Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.
