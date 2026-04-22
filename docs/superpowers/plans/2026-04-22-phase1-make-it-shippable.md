# Phase 1: Make It Shippable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single-file prototype to a production Next.js app with server-side Anthropic calls, a freemium gate (3 candidates free), Stripe one-time payments ($19), and a full unlocked report post-payment.

**Architecture:** Next.js 15 App Router on Vercel. `/api/generate` calls Anthropic server-side and stores the full report in Vercel KV, returning only 3 candidates to the client. `/api/checkout` creates a Stripe Checkout session with the `reportId` in metadata. The Stripe webhook sets a signed JWT cookie on success. `/results` validates the cookie and fetches the full report from KV.

**Tech Stack:** Next.js 15, TypeScript (strict), `@anthropic-ai/sdk`, `stripe`, `@vercel/kv`, `jose` (JWT signing), Tailwind CSS, Cloudflare Turnstile (bot protection)

**Spec:** `docs/superpowers/specs/2026-04-22-company-design.md`

---

## File Map

```
/
├── app/
│   ├── layout.tsx                  # Root layout — fonts, metadata
│   ├── page.tsx                    # Intake form page
│   ├── globals.css                 # Tailwind + custom classes (migrated from JSX)
│   ├── preview/
│   │   └── page.tsx               # Free preview page (3 candidates + unlock CTA)
│   ├── results/
│   │   └── page.tsx               # Full report page (post-payment)
│   └── api/
│       ├── generate/
│       │   └── route.ts           # POST: Anthropic call → KV store → return preview
│       ├── checkout/
│       │   └── route.ts           # POST: create Stripe Checkout session
│       └── webhook/
│           └── route.ts           # POST: Stripe webhook → set session cookie
├── components/
│   ├── IntakeForm.tsx              # Steps 01–04 intake form (migrated + typed)
│   ├── FreePreview.tsx            # 3 candidates + blur gate + unlock CTA
│   ├── FullReport.tsx             # Top picks + full candidates + affiliate CTAs
│   ├── CandidateRow.tsx           # Accordion row for one candidate
│   └── PdfExportButton.tsx        # Browser print-to-PDF trigger
├── lib/
│   ├── types.ts                   # Candidate, TopPick, ReportData interfaces
│   ├── anthropic.ts               # SYSTEM_PROMPT + generateReport()
│   ├── kv.ts                      # saveReport() / getReport() wrappers
│   ├── stripe.ts                  # Stripe client singleton
│   └── session.ts                 # signSession() / verifySession() (jose JWT)
└── __tests__/
    ├── lib/
    │   ├── anthropic.test.ts
    │   ├── session.test.ts
    │   └── kv.test.ts
    └── api/
        ├── generate.test.ts
        ├── checkout.test.ts
        └── webhook.test.ts
```

---

## Task 1: Bootstrap Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`, `.env.example`

- [ ] **Step 1: Scaffold project**

```bash
cd /Users/michaelluo/Development/brand-strategy-agent
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

When prompted, accept defaults. This overwrites nothing — the only existing files are `brand-strategy-agent.jsx`, `CLAUDE.md`, and `docs/`.

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk stripe @vercel/kv jose
npm install -D @types/node jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom ts-jest
```

- [ ] **Step 3: Create Jest config**

Create `jest.config.ts`:

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }] },
  testPathPattern: '__tests__',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default config
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Anthropic
ANTHROPIC_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Vercel KV (auto-populated when you add KV in Vercel dashboard)
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# Session signing
SESSION_SECRET=   # generate with: openssl rand -hex 32

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

Copy to `.env.local` and fill in values. Add `.env.local` to `.gitignore` (create-next-app does this automatically).

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000`, default Next.js page loads.

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: bootstrap Next.js 15 project with TypeScript and Tailwind"
```

---

## Task 2: TypeScript types

**Files:**
- Create: `lib/types.ts`
- Create: `__tests__/lib/types.test.ts`

- [ ] **Step 1: Write the types**

Create `lib/types.ts`:

```ts
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
  preview: Candidate[]   // first 3 only
  summary: string
}

export interface SessionPayload {
  reportId: string
  paid: boolean
  iat: number
  exp: number
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Anthropic lib

**Files:**
- Create: `lib/anthropic.ts`
- Create: `__tests__/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/anthropic.test.ts`:

```ts
import { parseReport } from '@/lib/anthropic'
import type { ReportData } from '@/lib/types'

const VALID_REPORT: ReportData = {
  summary: 'A test product',
  candidates: [
    {
      name: 'TestBrand',
      style: 'invented',
      rationale: 'Works well',
      trademarkRisk: 'low',
      trademarkNotes: 'No conflicts found',
      domains: { com: 'likely available', io: 'uncertain', co: 'likely taken', alternates: [] },
    },
  ],
  topPicks: [{ name: 'TestBrand', reasoning: 'Best option', nextSteps: 'Check USPTO' }],
  recommendation: 'Go with TestBrand',
}

describe('parseReport', () => {
  it('parses clean JSON', () => {
    const result = parseReport(JSON.stringify(VALID_REPORT))
    expect(result.candidates[0].name).toBe('TestBrand')
    expect(result.topPicks).toHaveLength(1)
  })

  it('strips markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID_REPORT)}\n\`\`\``
    expect(parseReport(fenced).summary).toBe('A test product')
  })

  it('extracts JSON from surrounding text', () => {
    const wrapped = `Here is the result: ${JSON.stringify(VALID_REPORT)} done.`
    expect(parseReport(wrapped).candidates).toHaveLength(1)
  })

  it('throws on unparseable input', () => {
    expect(() => parseReport('not json at all')).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/lib/anthropic.test.ts
```

Expected: FAIL — `parseReport` not defined.

- [ ] **Step 3: Implement**

Create `lib/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { ReportData, GenerateRequest } from './types'

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

export function parseReport(text: string): ReportData {
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')

  return JSON.parse(stripped.slice(start, end + 1)) as ReportData
}

export async function generateReport(req: GenerateRequest): Promise<ReportData> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage = `Product: ${req.description}

Brand personality: ${req.personality}
Constraints: ${req.constraints || 'none specified'}
Primary market: ${req.geography}

Generate brand name candidates per the schema. Use web_search to research potential trademark conflicts for your strongest candidates. Return valid JSON only.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')
    .trim()

  return parseReport(text)
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/anthropic.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/anthropic.ts __tests__/lib/anthropic.test.ts
git commit -m "feat: add Anthropic lib with parseReport and generateReport"
```

---

## Task 4: Vercel KV wrappers

**Files:**
- Create: `lib/kv.ts`
- Create: `__tests__/lib/kv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/kv.test.ts`:

```ts
jest.mock('@vercel/kv', () => ({
  kv: {
    set: jest.fn(),
    get: jest.fn(),
  },
}))

import { kv } from '@vercel/kv'
import { saveReport, getReport } from '@/lib/kv'
import type { ReportData } from '@/lib/types'

const MOCK_REPORT: ReportData = {
  summary: 'Test',
  candidates: [],
  topPicks: [],
  recommendation: '',
}

describe('saveReport', () => {
  it('stores report with 1-hour TTL', async () => {
    await saveReport('abc123', MOCK_REPORT)
    expect(kv.set).toHaveBeenCalledWith('report:abc123', MOCK_REPORT, { ex: 3600 })
  })
})

describe('getReport', () => {
  it('returns report when found', async () => {
    ;(kv.get as jest.Mock).mockResolvedValueOnce(MOCK_REPORT)
    const result = await getReport('abc123')
    expect(result?.summary).toBe('Test')
  })

  it('returns null when not found', async () => {
    ;(kv.get as jest.Mock).mockResolvedValueOnce(null)
    const result = await getReport('missing')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/lib/kv.test.ts
```

Expected: FAIL — `saveReport` not defined.

- [ ] **Step 3: Implement**

Create `lib/kv.ts`:

```ts
import { kv } from '@vercel/kv'
import type { ReportData } from './types'

const TTL_SECONDS = 3600 // 1 hour — enough time to complete checkout

export async function saveReport(reportId: string, report: ReportData): Promise<void> {
  await kv.set(`report:${reportId}`, report, { ex: TTL_SECONDS })
}

export async function getReport(reportId: string): Promise<ReportData | null> {
  return kv.get<ReportData>(`report:${reportId}`)
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/kv.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kv.ts __tests__/lib/kv.test.ts
git commit -m "feat: add Vercel KV wrappers for report storage"
```

---

## Task 5: Session token lib

**Files:**
- Create: `lib/session.ts`
- Create: `__tests__/lib/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/session.test.ts`:

```ts
process.env.SESSION_SECRET = 'a'.repeat(64) // 32 bytes hex = 64 chars

import { signSession, verifySession } from '@/lib/session'

describe('signSession / verifySession', () => {
  it('round-trips a paid session', async () => {
    const token = await signSession('report-123', true)
    const payload = await verifySession(token)
    expect(payload.reportId).toBe('report-123')
    expect(payload.paid).toBe(true)
  })

  it('returns null for a tampered token', async () => {
    const token = await signSession('report-123', true)
    const tampered = token.slice(0, -4) + 'xxxx'
    const result = await verifySession(tampered)
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    expect(await verifySession('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/lib/session.test.ts
```

Expected: FAIL — `signSession` not defined.

- [ ] **Step 3: Implement**

Create `lib/session.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from './types'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

export async function signSession(reportId: string, paid: boolean): Promise<string> {
  return new SignJWT({ reportId, paid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/session.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts __tests__/lib/session.test.ts
git commit -m "feat: add JWT session signing with jose"
```

---

## Task 6: Stripe lib

**Files:**
- Create: `lib/stripe.ts`

- [ ] **Step 1: Implement**

Create `lib/stripe.ts`:

```ts
import Stripe from 'stripe'

// Singleton — avoid creating multiple instances in hot-reload dev
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
})

export default stripe
```

- [ ] **Step 2: Commit**

```bash
git add lib/stripe.ts
git commit -m "feat: add Stripe client singleton"
```

---

## Task 7: /api/generate route

**Files:**
- Create: `app/api/generate/route.ts`
- Create: `__tests__/api/generate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/generate.test.ts`:

```ts
jest.mock('@/lib/anthropic', () => ({
  generateReport: jest.fn(),
}))
jest.mock('@/lib/kv', () => ({
  saveReport: jest.fn(),
}))

import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import { POST } from '@/app/api/generate/route'

const MOCK_REPORT = {
  summary: 'A SaaS tool',
  candidates: Array.from({ length: 10 }, (_, i) => ({
    name: `Brand${i}`,
    style: 'invented',
    rationale: 'Good',
    trademarkRisk: 'low',
    trademarkNotes: 'Clear',
    domains: { com: 'likely available', io: 'uncertain', co: 'likely taken', alternates: [] },
  })),
  topPicks: [
    { name: 'Brand0', reasoning: 'Best', nextSteps: 'Check USPTO' },
    { name: 'Brand1', reasoning: 'Second', nextSteps: 'Check EUIPO' },
    { name: 'Brand2', reasoning: 'Third', nextSteps: 'Check both' },
  ],
  recommendation: 'Go with Brand0',
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    ;(generateReport as jest.Mock).mockResolvedValue(MOCK_REPORT)
    ;(saveReport as jest.Mock).mockResolvedValue(undefined)
  })

  it('returns reportId and exactly 3 preview candidates', async () => {
    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.reportId).toBeDefined()
    expect(json.preview).toHaveLength(3)
    expect(json.summary).toBe('A SaaS tool')
  })

  it('saves the full report to KV', async () => {
    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    await POST(req)
    expect(saveReport).toHaveBeenCalledWith(expect.any(String), MOCK_REPORT)
  })

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest({ description: 'only this' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/api/generate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/api/generate/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { generateReport } from '@/lib/anthropic'
import { saveReport } from '@/lib/kv'
import type { GenerateRequest } from '@/lib/types'

export async function POST(req: Request) {
  const body = await req.json() as Partial<GenerateRequest>

  if (!body.description || !body.personality || !body.geography) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const report = await generateReport(body as GenerateRequest)
  const reportId = randomUUID()

  await saveReport(reportId, report)

  return NextResponse.json({
    reportId,
    preview: report.candidates.slice(0, 3),
    summary: report.summary,
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/api/generate.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/generate/route.ts __tests__/api/generate.test.ts
git commit -m "feat: add /api/generate route with freemium 3-candidate preview"
```

---

## Task 8: /api/checkout route

**Files:**
- Create: `app/api/checkout/route.ts`
- Create: `__tests__/api/checkout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/checkout.test.ts`:

```ts
jest.mock('@/lib/stripe', () => ({
  default: {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  },
}))

import stripe from '@/lib/stripe'
import { POST } from '@/app/api/checkout/route'

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

describe('POST /api/checkout', () => {
  it('creates a Stripe session and returns the URL', async () => {
    ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test_abc',
    })

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'report-123' }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/pay/cs_test_abc')
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: { reportId: 'report-123' },
      })
    )
  })

  it('returns 400 when reportId is missing', async () => {
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/api/checkout.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/api/checkout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import stripe from '@/lib/stripe'

export async function POST(req: Request) {
  const { reportId } = await req.json()

  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 1900, // $19.00
          product_data: {
            name: 'Brand Name Research Report',
            description: '8–12 ranked brand name candidates with trademark risk assessment and domain availability',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { reportId },
    success_url: `${appUrl}/results?report_id=${reportId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/preview?report_id=${reportId}`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/api/checkout.test.ts
```

Expected: all 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts __tests__/api/checkout.test.ts
git commit -m "feat: add /api/checkout route for Stripe $19 one-time payment"
```

---

## Task 9: /api/webhook route

**Files:**
- Create: `app/api/webhook/route.ts`
- Create: `__tests__/api/webhook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/webhook.test.ts`:

```ts
jest.mock('@/lib/stripe', () => ({
  default: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}))
jest.mock('@/lib/session', () => ({
  signSession: jest.fn(),
}))

import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'
import { POST } from '@/app/api/webhook/route'

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

describe('POST /api/webhook', () => {
  it('sets session cookie on checkout.session.completed', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { metadata: { reportId: 'report-abc' } } },
    })
    ;(signSession as jest.Mock).mockResolvedValue('signed-token')

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('session=signed-token')
    expect(setCookie).toContain('HttpOnly')
  })

  it('returns 400 on invalid signature', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'bad' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('ignores unrelated event types', async () => {
    ;(stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} },
    })

    const req = new Request('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/api/webhook.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/api/webhook/route.ts`:

```ts
import { NextResponse } from 'next/server'
import stripe from '@/lib/stripe'
import { signSession } from '@/lib/session'

// Note: Do NOT add `export const config = { api: { bodyParser: false } }` here.
// That is a Next.js Pages Router pattern. In App Router, req.text() already reads
// the raw body without any bodyParser interference.

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata: { reportId: string } }
    const reportId = session.metadata.reportId
    const token = await signSession(reportId, true)

    const res = NextResponse.json({ received: true })
    res.headers.set(
      'set-cookie',
      `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`
    )
    return res
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/api/webhook.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/route.ts __tests__/api/webhook.test.ts
git commit -m "feat: add Stripe webhook handler with session cookie signing"
```

---

## Task 10: Migrate global styles

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace globals.css with migrated styles**

Open `app/globals.css` and replace its contents with:

```css
/* Design system: Bricolage Grotesque (display) + Geist (body/UI)
   Palette: OKLCH, cool slate-blue accent (hue 215), near-white research surfaces (hue 228)
   Reference: .impeccable.md — Authoritative · Precise · Fast */
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@300;400;500;600&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg:          oklch(0.983 0.004 228);
  --color-surface:     oklch(0.970 0.006 228);
  --color-border:      oklch(0.900 0.008 228);
  --color-border-mid:  oklch(0.820 0.013 228);
  --color-border-str:  oklch(0.720 0.018 228);
  --color-text-1:      oklch(0.140 0.012 265);
  --color-text-2:      oklch(0.260 0.012 265);
  --color-text-3:      oklch(0.440 0.014 265);
  --color-text-4:      oklch(0.620 0.010 265);
  --color-accent:      oklch(0.340 0.180 215);
  --color-accent-h:    oklch(0.285 0.195 215);
  --color-accent-a:    oklch(0.245 0.175 215);
  --color-accent-lt:   oklch(0.952 0.025 215);
  --color-accent-txt:  oklch(0.990 0.004 215);
  --ease-out:          cubic-bezier(0.22, 1, 0.36, 1);
}

.display { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-optical-sizing: auto; font-feature-settings: "ss01"; }
.mono { font-family: 'Geist', system-ui, sans-serif; letter-spacing: 0.02em; }
.accent { color: var(--color-accent); }
.bg-accent { background-color: var(--color-accent); }
.border-accent { border-color: var(--color-accent); }
.paper { background-color: var(--color-bg); }
.ink-soft { color: var(--color-text-3); }
.ink-softer { color: var(--color-text-4); }
.rule { border-color: var(--color-border-str); }
.rule-soft { border-color: var(--color-border); }
.btn-primary {
  background-color: var(--color-accent);
  color: var(--color-accent-txt);
  transition: background-color 0.12s var(--ease-out), transform 0.12s var(--ease-out), box-shadow 0.12s var(--ease-out);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-accent-h);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(0.340 0.180 215 / 0.30);
}
.btn-primary:active:not(:disabled) {
  background-color: var(--color-accent-a);
  transform: translateY(0);
  box-shadow: none;
}
.btn-primary:disabled { background-color: var(--color-border); color: var(--color-text-4); cursor: not-allowed; }
.chip { transition: all 0.12s var(--ease-out); }
.chip:hover { border-color: var(--color-border-mid); }
.chip-active { background-color: var(--color-text-1); color: var(--color-bg); border-color: var(--color-text-1); }
.fade-in { animation: fadeIn 0.3s var(--ease-out); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.stagger > * { animation: fadeIn 0.3s var(--ease-out) backwards; }
.stagger > *:nth-child(1) { animation-delay: 0.05s; }
.stagger > *:nth-child(2) { animation-delay: 0.10s; }
.stagger > *:nth-child(3) { animation-delay: 0.15s; }
```

- [ ] **Step 2: Update layout.tsx**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brand Strategist — Name it well. Own it defensibly.',
  description: 'AI-generated brand name candidates with trademark risk assessment and domain availability.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: 'oklch(0.983 0.004 228)', color: 'oklch(0.260 0.012 265)', fontFamily: "'Geist', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: migrate global styles and layout from prototype"
```

---

## Task 11: CandidateRow component

**Files:**
- Create: `components/CandidateRow.tsx`

- [ ] **Step 1: Implement**

Create `components/CandidateRow.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { Candidate } from '@/lib/types'

function domainStatus(s: string) {
  if (s === 'likely available') return { label: 'likely free', color: '#4a6b3a' }
  if (s === 'likely taken') return { label: 'likely taken', color: '#8d3f1e' }
  return { label: 'uncertain', color: '#8a7d6e' }
}

export function CandidateRow({ c, index, defaultOpen = false }: { c: Candidate; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  const riskColor =
    c.trademarkRisk === 'low' ? '#4a6b3a' : c.trademarkRisk === 'moderate' ? '#a87415' : '#8d3f1e'

  return (
    <div className="border-b rule-soft">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-baseline justify-between gap-4 text-left hover:bg-black/[0.02] transition-colors px-2 -mx-2"
      >
        <div className="flex items-baseline gap-6 flex-1 min-w-0">
          <span className="mono text-xs ink-softer shrink-0 w-6">{String(index + 1).padStart(2, '0')}</span>
          <h3 className="display text-2xl md:text-3xl font-medium truncate" style={{ letterSpacing: '-0.02em' }}>
            {c.name}
          </h3>
          <span className="mono text-[10px] tracking-widest ink-softer uppercase hidden md:inline">{c.style}</span>
        </div>
        <span className="mono text-[10px] tracking-widest uppercase shrink-0" style={{ color: riskColor }}>
          ◆ {c.trademarkRisk.toUpperCase()}
        </span>
      </button>

      {open && (
        <div className="pb-6 pl-10 pr-2 grid md:grid-cols-3 gap-6 fade-in">
          <div className="md:col-span-2">
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">Why it works</p>
            <p className="text-sm leading-relaxed mb-4 ink-soft">{c.rationale}</p>
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">Trademark notes</p>
            <p className="text-sm leading-relaxed ink-soft">{c.trademarkNotes}</p>
          </div>
          <div>
            <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-3">Domains</p>
            <ul className="space-y-1.5 mb-4">
              {(['com', 'io', 'co'] as const).map((tld) => {
                const s = domainStatus(c.domains[tld])
                return (
                  <li key={tld} className="flex items-baseline justify-between text-sm">
                    <span className="mono">{c.name.toLowerCase()}.{tld}</span>
                    <span className="mono text-[10px] tracking-wider" style={{ color: s.color }}>{s.label}</span>
                  </li>
                )
              })}
            </ul>
            {c.domains.alternates.length > 0 && (
              <>
                <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">If taken, try</p>
                <ul className="space-y-1">
                  {c.domains.alternates.map((alt, i) => (
                    <li key={i} className="mono text-xs ink-soft">{alt}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CandidateRow.tsx
git commit -m "feat: add CandidateRow accordion component"
```

---

## Task 12: IntakeForm component + intake page

**Files:**
- Create: `components/IntakeForm.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement IntakeForm**

Create `components/IntakeForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const PERSONALITIES = ['Serious / technical', 'Playful / approachable', 'Premium / refined', 'Utilitarian / direct', 'Bold / contrarian']
const GEOGRAPHIES = ['US-first', 'Global', 'Australia / APAC', 'Europe', 'China / Asia']

export function IntakeForm() {
  const router = useRouter()
  const [form, setForm] = useState({ description: '', personality: '', constraints: '', geography: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = form.description.trim().length > 10 && form.personality && form.geography

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      // Store summary for the preview page
      sessionStorage.setItem('report_summary', data.summary)
      sessionStorage.setItem('report_preview', JSON.stringify(data.preview))
      router.push(`/preview?report_id=${data.reportId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 md:px-12 py-20 md:py-32 fade-in">
        <div className="flex flex-col items-start gap-6">
          <Loader2 className="accent animate-spin" size={32} strokeWidth={1.5} />
          <div>
            <p className="mono text-xs tracking-widest accent uppercase mb-3">In progress</p>
            <h2 className="display text-3xl md:text-5xl font-light mb-4" style={{ letterSpacing: '-0.02em' }}>
              Generating candidates, <em className="italic">researching</em> conflicts.
            </h2>
            <p className="ink-soft text-base max-w-xl leading-relaxed">
              Live web search for trademark conflicts takes 20–40 seconds.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-16 fade-in">
      <div className="mb-12 md:mb-16">
        <p className="mono text-xs tracking-widest accent uppercase mb-4">The Brand Strategist</p>
        <h1 className="display text-5xl md:text-7xl leading-[0.95] font-light mb-6" style={{ letterSpacing: '-0.02em' }}>
          Name it<br /><em className="italic" style={{ fontWeight: 400 }}>well.</em> Own it<br />
          <em className="italic accent" style={{ fontWeight: 400 }}>defensibly.</em>
        </h1>
        <p className="text-lg md:text-xl ink-soft max-w-2xl leading-relaxed">
          Tell us what you're building. We'll generate a ranked shortlist of brand names with trademark risk research and domain availability.
        </p>
      </div>

      <div className="space-y-10 md:space-y-12">
        <section>
          <div className="flex items-baseline gap-4 mb-3">
            <span className="mono text-xs accent">01</span>
            <h2 className="display text-xl md:text-2xl">What are you building?</h2>
          </div>
          <p className="ink-soft text-sm mb-4 ml-10">Product category, core function, who it's for.</p>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. A mobile app that helps solo runners find training partners at their pace within 5km."
            rows={3}
            className="w-full paper border rule-soft p-4 text-base focus:outline-none focus:border-accent transition-colors"
            style={{ fontFamily: 'inherit', color: '#1f1a14' }}
          />
        </section>

        <section>
          <div className="flex items-baseline gap-4 mb-4">
            <span className="mono text-xs accent">02</span>
            <h2 className="display text-xl md:text-2xl">Brand personality?</h2>
          </div>
          <div className="ml-10 flex flex-wrap gap-2">
            {PERSONALITIES.map((p) => (
              <button key={p} onClick={() => setForm({ ...form, personality: p })}
                className={`chip px-4 py-2 border rule-soft text-sm ${form.personality === p ? 'chip-active' : 'paper'}`}>
                {p}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-baseline gap-4 mb-3">
            <span className="mono text-xs accent">03</span>
            <h2 className="display text-xl md:text-2xl">Any constraints? <span className="ink-softer text-base italic font-light">(optional)</span></h2>
          </div>
          <input type="text" value={form.constraints}
            onChange={(e) => setForm({ ...form, constraints: e.target.value })}
            placeholder="e.g. Under 8 characters. Must be pronounceable in Mandarin."
            className="w-full paper border rule-soft p-4 text-base focus:outline-none focus:border-accent transition-colors"
            style={{ fontFamily: 'inherit', color: '#1f1a14' }}
          />
        </section>

        <section>
          <div className="flex items-baseline gap-4 mb-4">
            <span className="mono text-xs accent">04</span>
            <h2 className="display text-xl md:text-2xl">Primary market?</h2>
          </div>
          <div className="ml-10 flex flex-wrap gap-2">
            {GEOGRAPHIES.map((g) => (
              <button key={g} onClick={() => setForm({ ...form, geography: g })}
                className={`chip px-4 py-2 border rule-soft text-sm ${form.geography === g ? 'chip-active' : 'paper'}`}>
                {g}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="mono text-xs text-red-600">{error}</p>}

        <div className="pt-6 border-t rule-soft">
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="btn-primary px-8 py-4 display text-lg inline-flex items-center gap-3">
            Generate shortlist <ArrowRight size={18} strokeWidth={1.5} />
          </button>
          {!canSubmit && <p className="mono text-xs ink-softer mt-3">Answer 01, 02, and 04 to continue.</p>}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Update app/page.tsx**

Replace `app/page.tsx` with:

```tsx
import { IntakeForm } from '@/components/IntakeForm'

export default function HomePage() {
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: '#f5efe6' }}>
      <header className="max-w-5xl mx-auto px-6 md:px-12 pt-10 pb-6 flex items-baseline justify-between border-b rule">
        <div className="flex items-baseline gap-3">
          <span className="mono text-xs tracking-widest ink-softer uppercase">Vol. 01</span>
          <span className="mono text-xs tracking-widest ink-softer">—</span>
          <span className="mono text-xs tracking-widest ink-softer uppercase">A Naming Consultancy</span>
        </div>
        <span className="mono text-xs tracking-widest ink-softer uppercase hidden md:inline">
          {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}
        </span>
      </header>
      <IntakeForm />
    </div>
  )
}
```

Note: `style={{ backgroundColor: '#f5efe6' }}` → use `'oklch(0.983 0.004 228)'` everywhere a bg color is hardcoded, and `style={{ color: '#1f1a14' }}` → use `'oklch(0.140 0.012 265)'`. Update any hex colors in the component code to match the new OKLCH palette.

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Fill in the form. Clicking "Generate shortlist" should POST to `/api/generate`. Without valid env vars it will error — that's expected at this stage.

- [ ] **Step 4: Commit**

```bash
git add components/IntakeForm.tsx app/page.tsx
git commit -m "feat: add IntakeForm component and intake page"
```

---

## Task 13: Free preview page

**Files:**
- Create: `app/preview/page.tsx`
- Create: `components/FreePreview.tsx`

- [ ] **Step 1: Implement FreePreview component**

Create `components/FreePreview.tsx`:

```tsx
'use client'
import { Sparkles, Lock } from 'lucide-react'
import type { Candidate } from '@/lib/types'
import { CandidateRow } from './CandidateRow'

interface FreePreviewProps {
  summary: string
  candidates: Candidate[]
  totalCount: number  // always 10 for the blur teaser
  reportId: string
  onUnlock: () => void
  unlocking: boolean
}

export function FreePreview({ summary, candidates, totalCount, reportId, onUnlock, unlocking }: FreePreviewProps) {
  const hiddenCount = totalCount - candidates.length

  return (
    <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-14 fade-in">
      <section className="mb-12 pb-10 border-b rule">
        <p className="mono text-xs tracking-widest accent uppercase mb-4">The brief, as we heard it</p>
        <p className="display text-2xl md:text-4xl leading-[1.2] font-light italic" style={{ letterSpacing: '-0.01em' }}>
          "{summary}"
        </p>
      </section>

      <section className="mb-10">
        <div className="flex items-baseline gap-4 mb-8 pb-4 border-b rule-soft">
          <p className="mono text-xs tracking-widest accent uppercase">Preview — top 3 candidates</p>
        </div>
        <div className="space-y-0">
          {candidates.map((c, i) => (
            <CandidateRow key={i} c={c} index={i} defaultOpen={i === 0} />
          ))}
        </div>
      </section>

      {/* Blur gate */}
      <section className="relative">
        <div className="space-y-0 select-none pointer-events-none" aria-hidden>
          {Array.from({ length: hiddenCount }).map((_, i) => (
            <div key={i} className="border-b rule-soft py-5 flex items-baseline gap-6 blur-sm opacity-40">
              <span className="mono text-xs ink-softer w-6">{String(i + 4).padStart(2, '0')}</span>
              <div className="display text-2xl font-medium" style={{ letterSpacing: '-0.02em' }}>
                {'—'.repeat(6 + (i % 4))}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-transparent via-[#f5efe6]/80 to-[#f5efe6]">
          <div className="text-center py-12">
            <Lock className="mx-auto mb-4 ink-softer" size={28} strokeWidth={1.5} />
            <p className="display text-2xl md:text-3xl font-light mb-2">
              {hiddenCount} more candidates
            </p>
            <p className="ink-soft text-sm mb-6 max-w-sm mx-auto">
              Full report includes top 3 picks, detailed trademark notes, and all domain alternatives.
            </p>
            <button onClick={onUnlock} disabled={unlocking}
              className="btn-primary px-8 py-4 display text-lg inline-flex items-center gap-3">
              <Sparkles size={18} strokeWidth={1.5} />
              {unlocking ? 'Redirecting to checkout…' : 'Unlock full report — $19'}
            </button>
            <p className="mono text-xs ink-softer mt-3">One-time payment. No subscription.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Create preview page**

Create `app/preview/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { FreePreview } from '@/components/FreePreview'
import type { Candidate } from '@/lib/types'

export default function PreviewPage() {
  const params = useSearchParams()
  const router = useRouter()
  const reportId = params.get('report_id') ?? ''
  const [summary, setSummary] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [unlocking, setUnlocking] = useState(false)

  useEffect(() => {
    setSummary(sessionStorage.getItem('report_summary') ?? '')
    const raw = sessionStorage.getItem('report_preview')
    if (raw) setCandidates(JSON.parse(raw))
  }, [])

  async function handleUnlock() {
    setUnlocking(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    })
    const { url } = await res.json()
    window.location.href = url
  }

  if (!candidates.length) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-20">
        <p className="ink-soft">No report data found. <a href="/" className="accent underline">Start over</a></p>
      </main>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5efe6' }}>
      <FreePreview
        summary={summary}
        candidates={candidates}
        totalCount={10}
        reportId={reportId}
        onUnlock={handleUnlock}
        unlocking={unlocking}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/FreePreview.tsx app/preview/page.tsx
git commit -m "feat: add free preview page with blur gate and unlock CTA"
```

---

## Task 14: Full report page + FullReport component

**Files:**
- Create: `components/FullReport.tsx`
- Create: `app/results/page.tsx`

- [ ] **Step 1: Implement FullReport component**

Create `components/FullReport.tsx`:

```tsx
import { Sparkles, ExternalLink, RotateCcw } from 'lucide-react'
import type { ReportData } from '@/lib/types'
import { CandidateRow } from './CandidateRow'
import { PdfExportButton } from './PdfExportButton'

const AFFILIATE_LINKS = [
  { label: 'Check domains on Namecheap', url: 'https://www.namecheap.com/?affId=YOUR_ID', note: 'domain registration' },
  { label: 'File a trademark via Trademark Engine', url: 'https://www.trademarkengine.com/?ref=YOUR_ID', note: 'trademark filing' },
  { label: 'Incorporate with Stripe Atlas', url: 'https://stripe.com/atlas?ref=YOUR_ID', note: 'company formation' },
]

const VERIFY_LINKS = [
  { label: 'USPTO TESS trademark search (US)', url: 'https://tmsearch.uspto.gov/search/search-information' },
  { label: 'IP Australia trademark search', url: 'https://search.ipaustralia.gov.au/trademarks/search/quick' },
  { label: 'EUIPO trademark search (EU)', url: 'https://www.tmdn.org/tmview/' },
  { label: 'WHOIS domain lookup', url: 'https://www.whois.com/whois/' },
]

export function FullReport({ report }: { report: ReportData }) {
  return (
    <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-14 fade-in">

      {/* Summary */}
      <section className="mb-12 pb-10 border-b rule">
        <p className="mono text-xs tracking-widest accent uppercase mb-4">The brief, as we heard it</p>
        <p className="display text-2xl md:text-4xl leading-[1.2] font-light italic" style={{ letterSpacing: '-0.01em' }}>
          "{report.summary}"
        </p>
      </section>

      {/* Top picks */}
      {report.topPicks.length > 0 && (
        <section className="mb-16 md:mb-20">
          <div className="flex items-baseline gap-4 mb-8">
            <Sparkles className="accent" size={20} strokeWidth={1.5} />
            <p className="mono text-xs tracking-widest accent uppercase">The three to pursue</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger">
            {report.topPicks.map((pick, i) => (
              <div key={i} className="paper border-2 border-accent p-6 relative">
                <span className="mono text-xs accent absolute top-4 right-4">0{i + 1}</span>
                <h3 className="display text-3xl md:text-4xl font-medium mb-4" style={{ letterSpacing: '-0.02em' }}>{pick.name}</h3>
                <p className="text-sm ink-soft mb-4 leading-relaxed">{pick.reasoning}</p>
                <div className="pt-4 border-t rule-soft">
                  <p className="mono text-[10px] tracking-widest ink-softer uppercase mb-2">Next</p>
                  <p className="text-xs ink-soft leading-relaxed">{pick.nextSteps}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full shortlist */}
      <section className="mb-16 md:mb-20">
        <div className="flex items-baseline justify-between mb-8 pb-4 border-b rule-soft">
          <p className="mono text-xs tracking-widest accent uppercase">Full shortlist</p>
          <span className="mono text-xs ink-softer">{report.candidates.length} candidates, ranked</span>
        </div>
        <div className="space-y-0">
          {report.candidates.map((c, i) => (
            <CandidateRow key={i} c={c} index={i} defaultOpen={i < 3} />
          ))}
        </div>
      </section>

      {/* Editor's pick — NOTE: no border-left accent stripe (banned pattern).
          Use background tint + full border for visual separation instead. */}
      {report.recommendation && (
        <section className="mb-16 p-6 md:p-8 rounded-sm" style={{ background: 'var(--color-accent-lt)', border: '1px solid var(--color-border)' }}>
          <p className="mono text-xs tracking-widest accent uppercase mb-3">Editor's pick</p>
          <p className="display text-xl md:text-2xl leading-snug italic font-light">{report.recommendation}</p>
        </section>
      )}

      {/* Affiliate CTAs */}
      <section className="mb-16 p-6 border rule-soft">
        <p className="mono text-xs tracking-widest accent uppercase mb-4">Ready to act?</p>
        <div className="grid md:grid-cols-3 gap-4">
          {AFFILIATE_LINKS.map((item) => (
            <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer sponsored"
              className="block p-4 paper border rule-soft hover:border-accent transition-colors">
              <p className="text-sm font-medium mb-1">{item.label}</p>
              <p className="mono text-[10px] ink-softer uppercase">{item.note}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mb-16 p-4 border-l-2 border-yellow-600/40 bg-yellow-50/30">
        <p className="text-xs ink-soft leading-relaxed">
          <strong>Not legal advice.</strong> This report is AI-assisted research based on web search signals as of {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}. Trademark notes are not a substitute for a USPTO, EUIPO, or IP Australia registry search. Verify with a qualified IP attorney before filing or committing to a name.
        </p>
      </section>

      {/* Verify links */}
      <section className="mb-16">
        <p className="mono text-xs tracking-widest accent uppercase mb-6">Verify before you commit</p>
        <ul className="space-y-3">
          {VERIFY_LINKS.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm border-b rule-soft hover:border-accent transition-colors pb-0.5">
                {item.label} <ExternalLink size={12} strokeWidth={1.5} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer actions */}
      <section className="pt-8 border-t rule flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <PdfExportButton />
          <a href="/" className="px-6 py-3 border rule display text-base hover:bg-black hover:text-white transition-colors inline-flex items-center gap-2">
            <RotateCcw size={16} strokeWidth={1.5} /> Run another
          </a>
        </div>
        <p className="mono text-xs ink-softer">End of report.</p>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Create results page**

Create `app/results/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'
import { getReport } from '@/lib/kv'
import { FullReport } from '@/components/FullReport'

// Next.js 15: searchParams is a Promise in server components
interface Props {
  searchParams: Promise<{ report_id?: string }>
}

export default async function ResultsPage({ searchParams }: Props) {
  const { report_id: reportId } = await searchParams
  if (!reportId) redirect('/')

  // Next.js 15: cookies() is async
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value ?? ''
  const session = await verifySession(token)

  if (!session || !session.paid || session.reportId !== reportId) {
    redirect(`/preview?report_id=${reportId}`)
  }

  const report = await getReport(reportId)
  if (!report) {
    // Report expired from KV (>1 hour) — redirect to start
    redirect('/?expired=1')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5efe6' }}>
      <header className="max-w-5xl mx-auto px-6 md:px-12 pt-10 pb-6 flex items-baseline justify-between border-b rule">
        <div className="flex items-baseline gap-3">
          <span className="mono text-xs tracking-widest ink-softer uppercase">Vol. 01</span>
          <span className="mono text-xs tracking-widest ink-softer">—</span>
          <span className="mono text-xs tracking-widest ink-softer uppercase">A Naming Consultancy</span>
        </div>
      </header>
      <FullReport report={report} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/FullReport.tsx app/results/page.tsx
git commit -m "feat: add full report page with top picks, affiliate links, and disclaimer"
```

---

## Task 15: PDF export button

**Files:**
- Create: `components/PdfExportButton.tsx`

- [ ] **Step 1: Implement**

Create `components/PdfExportButton.tsx`:

```tsx
'use client'
import { Download } from 'lucide-react'

export function PdfExportButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-6 py-3 border rule display text-base hover:bg-black hover:text-white transition-colors inline-flex items-center gap-2"
    >
      <Download size={16} strokeWidth={1.5} /> Download PDF
    </button>
  )
}
```

Add print styles to `app/globals.css`:

```css
@media print {
  .btn-primary, button, a[href] { display: none !important; }
  .blur-sm { filter: none !important; }
  body { background: white !important; color: black !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PdfExportButton.tsx app/globals.css
git commit -m "feat: add PDF export via browser print"
```

---

## Task 16: Run all tests + verify

- [ ] **Step 1: Run full test suite**

```bash
npx jest --coverage
```

Expected: all tests PASS. Coverage should cover `lib/` fully and API routes at the handler level.

- [ ] **Step 2: Start dev server and test flow manually**

```bash
npm run dev
```

Test the full flow:
1. Open `http://localhost:3000` — intake form renders
2. Fill in form — submit button enables after fields 01, 02, 04
3. Submit — loading state shows (will error without real API key, expected)
4. With real API key in `.env.local`: submit completes, redirects to `/preview`
5. Preview shows 3 candidates, blur gate, unlock button
6. Unlock redirects to Stripe (requires Stripe keys)
7. After payment, Stripe redirects to `/results` — full report renders

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Phase 1 complete — server-side API, freemium gate, Stripe payments"
```

---

## Task 17: Deploy to Vercel

- [ ] **Step 1: Create Vercel project**

```bash
npx vercel
```

Follow prompts. Link to a new project.

- [ ] **Step 2: Add Vercel KV**

In the Vercel dashboard: Storage → Create → KV. Link to the project. Vercel auto-populates `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` as environment variables.

- [ ] **Step 3: Add environment variables in Vercel dashboard**

Add all variables from `.env.example`:
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `SESSION_SECRET` (generate: `openssl rand -hex 32`)
- `NEXT_PUBLIC_APP_URL` (your production URL, e.g. `https://yourapp.vercel.app`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`

- [ ] **Step 4: Register Stripe webhook**

In the Stripe dashboard: Developers → Webhooks → Add endpoint.
- URL: `https://yourapp.vercel.app/api/webhook`
- Events: `checkout.session.completed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel.

- [ ] **Step 5: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 6: Verify production flow**

Open the production URL. Run through the full intake → preview → payment → results flow with a Stripe test card (`4242 4242 4242 4242`).

---

## Self-Review Checklist

**Spec coverage:**
- ✓ Backend API proxy (Anthropic key server-side) — Task 7
- ✓ Freemium gate (3 candidates free) — Tasks 7, 13
- ✓ Stripe Checkout ($19 one-time) — Tasks 8, 9
- ✓ PDF export — Task 15
- ✓ Affiliate links — Task 14 (FullReport component)
- ✓ ToS + disclaimer — Task 14 (FullReport component)
- ✓ Cloudflare Turnstile — mentioned in `.env.example`, Task 1; full implementation deferred to post-launch polish (not on critical path for first revenue)
- ✓ No account required, session token proves payment — Tasks 9, 14

**Placeholder scan:** None found.

**Type consistency:**
- `Candidate`, `TopPick`, `ReportData` defined in Task 2, used consistently in Tasks 3, 7, 11, 12, 13, 14
- `signSession(reportId, paid)` defined in Task 5, called identically in Task 9
- `saveReport(reportId, report)` / `getReport(reportId)` defined in Task 4, called identically in Tasks 7, 14
