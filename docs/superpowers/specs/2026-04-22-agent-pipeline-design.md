# Agent Pipeline (Phase 2a) Design

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-pass Anthropic call with a verified three-step pipeline: generate candidates → parallel trademark + domain verification → synthesise final report.

**Architecture:** Step 1 (Claude, no tools) generates candidate names only. Step 2 fans out Signa trademark checks and DNS domain lookups in parallel across all candidates. Step 3 (Claude) synthesises a final report using the verified data. The existing API surface and output schema are unchanged.

**Tech Stack:** Next.js 16 App Router, `@anthropic-ai/sdk`, `@signa-so/sdk`, Node.js `dns.promises` (built-in, no new dependency)

---

## Data Types

### New: `CandidateProposal` (add to `src/lib/types.ts`)

What the model produces in Step 1 — creative output only, no verification data:

```typescript
export interface CandidateProposal {
  name: string
  style: 'descriptive' | 'invented' | 'metaphorical' | 'acronym' | 'compound'
  rationale: string
}
```

### Unchanged: `ReportData`

Final output schema is identical to today. No UI changes required.

### Internal only: `VerifiedCandidate`

Used to build the Step 3 synthesis prompt — never stored or returned to the client:

```typescript
interface VerifiedCandidate extends CandidateProposal {
  trademark: TrademarkCheckResult
  domains: DomainAvailability
}
```

---

## Step 1 — Generate Candidates (`lib/anthropic.ts`)

**New function:** `generateCandidates(req: GenerateRequest): Promise<CandidateProposal[]>`

- Single `client.messages.create` call with **no tools** (web_search removed)
- System prompt instructs model to return a JSON array of 8–12 `CandidateProposal` objects
- Personality input explicitly shapes style weighting (e.g. "utilitarian/direct" → bias toward descriptive/compound, suppress metaphorical)
- `parseProposals(text)` extracts and validates the array — throws if fewer than 5 candidates returned
- Typed error handling: `Anthropic.RateLimitError`, `Anthropic.AuthenticationError`, `Anthropic.APIError`

**Expected latency:** 5–10 seconds (no web_search round-trips)

---

## Step 2 — Parallel Verification

### Trademark: `lib/signa.ts` (minor signature update)

`checkAllTrademarks` signature changes from `(candidates: Candidate[], niceClass: number)` to `(candidates: { name: string }[], niceClass: number)` — the implementation only uses `c.name`, so no logic changes. Default NICE class: **42** (software/SaaS/IT services).

Each failed individual check returns `{ risk: 'uncertain', notes: 'Trademark search unavailable.' }` — does not abort the pipeline.

### Domains: `lib/dns.ts` (new file)

**New function:** `checkAllDomains(candidates: CandidateProposal[]): Promise<Map<string, DomainAvailability>>`

- For each candidate, checks `.com`, `.io`, `.co` simultaneously via `dns.promises.lookup()`
- Resolution → `'likely taken'`
- `ENOTFOUND` → `'likely available'`
- Any other error → `'uncertain'`
- All 30 lookups (10 candidates × 3 TLDs) run via a single `Promise.allSettled` — total overhead ~1–3 seconds
- `alternates` array is populated by Step 3 (Claude), not DNS

### Coordination

Both `checkAllTrademarks` and `checkAllDomains` are dispatched simultaneously via `Promise.all`:

```typescript
const [trademarkMap, domainMap] = await Promise.all([
  checkAllTrademarks(proposals, 42),
  checkAllDomains(proposals),
])
```

If either throws (not just individual failures, but a total crash), the pipeline catches and proceeds with empty maps — Step 3 still synthesises with whatever data is available.

**Expected latency:** 3–5 seconds

---

## Step 3 — Synthesise Report (`lib/anthropic.ts`)

**New function:** `synthesiseReport(req: GenerateRequest, verified: VerifiedCandidate[]): Promise<ReportData>`

- Builds a structured user message combining:
  - Original brief (description, personality, geography, constraints)
  - Each candidate with its verified trademark result and DNS domain availability
- System prompt instructs model to produce the full `ReportData` JSON:
  - Assess `trademarkRisk` using Signa data (number of conflicts, conflict severity)
  - Write `trademarkNotes` citing specific Signa findings
  - Set domain fields from DNS results; suggest `alternates` for taken domains
  - Select `topPicks` and write `recommendation`
- Output parsed and validated by existing `parseReport` + `validateReportData`
- **No tools** — all external data is already in the prompt

**Expected latency:** 10–15 seconds

---

## Orchestrator (`lib/anthropic.ts`)

`generateReport` becomes the pipeline coordinator — its signature and return type are unchanged so `api/generate/route.ts` requires no modification:

```typescript
export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  // Step 1
  const proposals = await generateCandidates(req)

  // Step 2
  const [trademarkMap, domainMap] = await Promise.all([
    checkAllTrademarks(proposals, 42),
    checkAllDomains(proposals),
  ])

  // Merge
  const verified: VerifiedCandidate[] = proposals.map((p) => ({
    ...p,
    trademark: trademarkMap.get(p.name) ?? {
      candidateName: p.name,
      risk: 'uncertain',
      notes: 'Unavailable.',
      sources: [],
    },
    domains: domainMap.get(p.name) ?? {
      com: 'uncertain',
      io: 'uncertain',
      co: 'uncertain',
      alternates: [],
    },
  }))

  // Step 3
  return synthesiseReport(req, verified)
}
```

---

## Error Handling

| Failure                         | Behaviour                                                  |
| ------------------------------- | ---------------------------------------------------------- |
| Step 1 throws (Anthropic error) | Re-throw — route returns 502                               |
| Step 1 returns < 5 candidates   | Throw — treated as generation failure, route returns 502   |
| Individual Signa check fails    | Returns `risk: 'uncertain'` — pipeline continues           |
| All Signa checks fail           | Empty trademark data passed to Step 3 — pipeline continues |
| Individual DNS lookup fails     | Returns `'uncertain'` for that domain — pipeline continues |
| Step 3 throws (Anthropic error) | Re-throw — route returns 502                               |
| Step 3 returns invalid schema   | `validateReportData` throws — route returns 502            |

No silent fallbacks. If the pipeline fails, the user gets a clear error and can retry — they are not charged (Stripe checkout happens after generation).

---

## Total Expected Latency

| Step                           | Time       |
| ------------------------------ | ---------- |
| Step 1: generate candidates    | 5–10s      |
| Step 2: Signa + DNS (parallel) | 3–5s       |
| Step 3: synthesise             | 10–15s     |
| **Total**                      | **18–30s** |

Comparable to today's 30–40s. The removal of `web_search` from Step 1 offsets the added verification overhead.

---

## Files Changed

| File                                  | Change                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/types.ts`                    | Add `CandidateProposal` interface                                                                     |
| `src/lib/anthropic.ts`                | Add `generateCandidates`, `synthesiseReport`, `parseProposals`; `generateReport` becomes orchestrator |
| `src/lib/dns.ts`                      | New file: `checkDomain`, `checkAllDomains`                                                            |
| `src/lib/signa.ts`                    | No changes                                                                                            |
| `src/app/api/generate/route.ts`       | No changes                                                                                            |
| `src/__tests__/lib/anthropic.test.ts` | Add tests for `generateCandidates`, `synthesiseReport`, `parseProposals`                              |
| `src/__tests__/lib/dns.test.ts`       | New file: tests for `checkAllDomains`                                                                 |

---

## Testing Strategy

- `generateCandidates` — mock `client.messages.create`, assert `CandidateProposal[]` shape, assert throws on < 5 candidates
- `parseProposals` — unit test: valid array, fenced JSON, fewer than 5 candidates throws
- `synthesiseReport` — mock `client.messages.create` returning valid `ReportData` JSON, assert output passes `validateReportData`
- `checkAllDomains` — mock `dns.promises.lookup`: resolves → `'likely taken'`, throws ENOTFOUND → `'likely available'`, throws other → `'uncertain'`
- `generateReport` integration — mock all three sub-functions, assert orchestration order and merge logic
