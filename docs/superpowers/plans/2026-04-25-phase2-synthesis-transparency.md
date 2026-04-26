# Phase 2: High-End Synthesis & Radical Transparency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the $19 report from a list of names into a rigorous, high-density strategic document that proves "Proof of Work" and provides a clear decision framework.

**Architecture:** We will extend the `ReportData` schema, update the Anthropic pipeline prompts to perform phonetic and strategic analysis (capturing rejected names in the first pass), and build high-density UI components for the 6-dimension scores, the Domain Confidence Matrix, and the Rejected Names section.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS (v4), TypeScript, Anthropic SDK.

---

### Task 1: Extend Data Models & Types

**Files:**

- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `Candidate` and `ReportData` types**

```typescript
// Inside src/lib/types.ts

export interface RejectedCandidate {
  name: string
  reason: string
}

// Update Candidate interface
export interface Candidate extends CandidateProposal {
  trademarkRisk: 'low' | 'moderate' | 'high' | 'uncertain'
  trademarkNotes: string
  domains: DomainAvailability
  // NEW Phase 2 Fields
  scores?: {
    nameQuality: number // 1-10
    strategicFit: number // 1-10
    trademarkSignal: number // 1-10
    domainSignal: number // 1-10
    differentiation: number // 1-10
    expansionPotential: number // 1-10
  }
  mechanism?: string // e.g., "The hard 'T' and 'K' sounds imply precision..."
  triadLabel?: 'safe' | 'bold' | 'best' | null
}

// Update ReportData interface
export interface ReportData {
  summary: string
  candidates: Candidate[]
  topPicks: TopPick[]
  recommendation: string
  // NEW Phase 2 Fields
  rejectedCandidates?: RejectedCandidate[]
}
```

- [ ] **Step 2: Verify and Commit**
      Run: `npx tsc --noEmit`
      Expected: Passes (ignoring existing warnings in other files).

```bash
git add src/lib/types.ts
git commit -m "types: extend Candidate and ReportData for Phase 2 synthesis"
```

---

### Task 2: Capture Rejected Names in Generation Phase

**Files:**

- Modify: `src/lib/anthropic.ts`

- [ ] **Step 1: Update `GENERATE_CANDIDATES_PROMPT` and `record_candidates` tool**

```typescript
// Inside src/lib/anthropic.ts

// Update the GENERATE_CANDIDATES_PROMPT (approx line 737)
const GENERATE_CANDIDATES_PROMPT = `... (existing instructions)
- TRACK REJECTIONS: Keep track of 3-5 names that you generated but rejected (e.g. too descriptive, too generic, or high trademark risk in your internal model). You will return these separately as "filteredCandidates".
...`

// Update the record_candidates tool schema in callGenerateCandidatesOnce (approx line 805)
// Add filteredCandidates property to the properties object
filteredCandidates: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      reason: { type: 'string', description: 'One sentence reason for rejection (e.g. Trademark crowding, Phonetic ambiguity)' }
    },
    required: ['name', 'reason']
  },
  minItems: 3,
  maxItems: 5
}
// Add 'filteredCandidates' to the tool's required array.
```

- [ ] **Step 2: Update `generateCandidates` return type and passing logic**
      Update `VerifiedCandidate` interface and the flow to ensure these names reach `synthesiseReport`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "pipeline: update generation prompt to capture filtered candidates"
```

---

### Task 3: Strategic Synthesis (Scores, Triad, & Mechanism)

**Files:**

- Modify: `src/lib/anthropic.ts`

- [ ] **Step 1: Update `SYNTHESISE_REPORT_PROMPT`**

```typescript
// Inside src/lib/anthropic.ts (approx line 865)

const SYNTHESISE_REPORT_PROMPT = `... (existing instructions)
- 6-DIMENSION SCORING: Evaluate every candidate from 1 to 10 across: Name Quality, Strategic Fit, Trademark Signal, Domain Signal, Differentiation, and Expansion Potential.
- PHONETIC MECHANISM: For every rationale, include a sentence (labeled as "Mechanism:") explaining the linguistic or phonetic reason the name works for this brand.
- DECISION TRIAD: From your top 3 picks, identify exactly one as "The Safe Bet" (lowest risk), one as "The Bold Move" (highest impact), and one as "The Best All-Rounder". Assign "safe", "bold", or "best" to triadLabel.
...`
```

- [ ] **Step 2: Update `record_report` tool schema**
      Add `scores`, `mechanism`, `triadLabel` to the item properties in `candidates` array.
      Add `rejectedCandidates` to the top-level properties of the tool input.

- [ ] **Step 3: Update `synthesiseReport` function to handle data passing**

- [ ] **Step 4: Verify and Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "pipeline: update synthesis prompt for 6-dimension scoring and triad logic"
```

---

### Task 4: UI — 6-Dimension Matrix & Linguistic Notes

**Files:**

- Modify: `src/components/CandidateRow.tsx`

- [ ] **Step 1: Implement visual matrix and mechanism rendering**

```tsx
// Inside src/components/CandidateRow.tsx

// Helper for formatting keys
const formatScoreKey = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase()
}

// Add inside the component render, under the rationale but above the domain matrix:
{
  c.mechanism && (
    <p className="text-xs italic text-[#787774] border-l-2 border-[#FF4F00] pl-3 mt-4">
      <span className="mono text-[9px] font-bold uppercase not-italic block mb-1">Mechanism</span>
      {c.mechanism}
    </p>
  )
}

// New Scores Matrix Section
{
  c.scores && (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-[#EAEAEA]">
      {Object.entries(c.scores).map(([key, value]) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between text-[9px] mono uppercase text-[#787774]">
            <span>{formatScoreKey(key)}</span>
            <span className="font-bold text-[#111111]">{value}/10</span>
          </div>
          <div className="h-1 bg-[#EAEAEA] w-full">
            <div className="h-full bg-[#FF4F00]" style={{ width: `${value * 10}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CandidateRow.tsx
git commit -m "feat: render candidate score matrix and linguistic mechanism"
```

---

### Task 5: UI — Decision Triad & Rejected Names

**Files:**

- Modify: `src/components/FullReport.tsx`
- Create: `src/components/RejectedNames.tsx`

- [ ] **Step 1: Add Triad Badges to Top Picks in `FullReport.tsx`**

- [ ] **Step 2: Create `RejectedNames.tsx` component**
      A monochromatic section showing `report.rejectedCandidates`.

- [ ] **Step 3: Integrate into `FullReport.tsx`**

- [ ] **Step 4: Commit**

```bash
git add src/components/FullReport.tsx src/components/RejectedNames.tsx
git commit -m "feat: implement decision triad badges and filtered candidates section"
```

---

### Task 6: UI — Domain Confidence Matrix

**Files:**

- Modify: `src/components/CandidateRow.tsx`

- [ ] **Step 1: Update "Domains Checked" to show raw signals (DNS/RDAP/Whois)**

- [ ] **Step 2: Verify and Commit**
      Run: `npm run test`

```bash
git add src/components/CandidateRow.tsx
git commit -m "feat: implement granular domain confidence matrix"
```
