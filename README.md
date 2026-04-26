# Namewright

A $19 brand-naming tool for solo founders pre-incorporation. Submit a brief, get 8–12 ranked name candidates with preliminary trademark screening (Signa + optional EUIPO) and domain availability (DNS + RDAP + WhoisJSON) across three TLDs. Cross-checked across selected sources, structured report in under 90 seconds.

**What it is:** structured naming + preliminary trademark/domain screening.
**What it isn't:** a brand strategy consultant, and not legal clearance. Positioning, messaging, visual identity, and competitive differentiation are out of scope. Trademark clearance requires a qualified attorney — we surface signals to inform that conversation, not replace it.

Landing copy: _"Name your brand. Before you commit."_

## Dev setup

```bash
npm install
cp .env.example .env.local  # fill in the keys — see .env.example for each var's purpose
npm run dev                 # starts Next.js + stripe listen concurrently on :3000
```

First-time Stripe CLI setup (required for the combined `npm run dev`):

```bash
brew install stripe/stripe-cli/stripe
stripe login               # one-time
# The webhook signing secret printed by `stripe listen` must match STRIPE_WEBHOOK_SECRET in .env.local
```

If you don't need webhook testing locally: `npm run dev:next` runs Next.js only.

### Local login (dev)

The "View my reports" flow needs a Postgres-backed user. Bring up the local stack and seed the two dev accounts:

```bash
docker compose up -d                # postgres, redis, kv-emulator, minio
npx prisma migrate dev              # apply schema to local postgres
npm run seed                        # creates seeded users
```

Seeded user accounts (`prisma/seed.ts`):

| Email                   | Purpose                    |
| ----------------------- | -------------------------- |
| `test@example.com`      | generic dev test account   |
| `founder@namewright.co` | founder-facing dev account |

Docker-compose service credentials (`docker-compose.yml`) — these match the values in `.env.local`:

| Service       | Host             | Credentials                                  | Used by                               |
| ------------- | ---------------- | -------------------------------------------- | ------------------------------------- |
| Postgres      | `localhost:5434` | `test-user` / `test-password` / `namewright` | Prisma (`DATABASE_URL`)               |
| Redis         | `localhost:6380` | (no auth)                                    | backs the KV emulator                 |
| KV emulator   | `localhost:8079` | token `test-token`                           | `KV_REST_API_URL/TOKEN`               |
| Minio (S3)    | `localhost:9000` | `test-account` / `test-secret`               | R2 (`R2_*`), bucket `namewright-test` |
| Minio console | `localhost:9001` | `test-account` / `test-secret`               | UI for inspecting R2 objects          |

To sign in, click "View my reports" → enter one of the emails above. `/api/auth/magic-link` only sends to addresses that already exist in the `User` table, so unseeded emails silently no-op (by design — prevents email enumeration).

Without `RESEND_API_KEY` set, no email goes out (and the URL is not logged). Either set `RESEND_API_KEY` in `.env.local`, or read the token directly from KV (`magic-link:*` keys map token → email) and visit `http://localhost:3000/api/auth/verify?token=<token>`.

**Skipping paid APIs during local debugging:** set `DEV_MOCK_PIPELINE=1` in `.env.local` to return a canned report fixture instead of calling Anthropic + Signa + EUIPO + WhoisJSON. Cuts each end-to-end test cycle from ~$0.25 and 90s to $0 and 200ms. The in-app toggle pill (top-right, dev-only) overrides per-request via the `x-dev-mock-pipeline` header. Guarded to refuse running in production even if set.

## Core scripts

| Command                           | Purpose                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Next.js + stripe-listen concurrently                                                                                             |
| `npm run dev:next`                | Next.js only                                                                                                                     |
| `npm run dev:stripe`              | stripe-listen only                                                                                                               |
| `npm run build`                   | production build                                                                                                                 |
| `npm run test`                    | Jest                                                                                                                             |
| `npx tsc --noEmit`                | type-check                                                                                                                       |
| `node scripts/accuracy-audit.mjs` | live 10-brief regression against the Anthropic + Signa + EUIPO + DNS pipeline (~$0.15/brief). Outputs to `/tmp/accuracy-audit/`. |
| `node scripts/e2e.mjs`            | 22-check Playwright smoke against localhost (full purchase journey)                                                              |

## Pipeline architecture

The pipeline is event-driven. `/api/generate` no longer runs synthesis in-band — it
mints a `jobId` + `reportId`, primes KV, and dispatches an Inngest event. The actual
work runs in a background function (`src/inngest/functions.tsx`). The frontend
polls a server-sent-events status endpoint until the job completes, then redirects
to the paywall preview.

```
intake form (IntakeForm.tsx)
  └─► POST /api/generate
        ├─► validate input + nameType allowlist
        ├─► setJobStatus(jobId, { status: 'pending' })
        ├─► inngest.send({ name: 'report.generate', data: { jobId, reportId, body, ... } })
        └─► return { jobId, reportId }   ◄── returns immediately

  └─► EventSource('/api/status/[jobId]')   ◄── 3s SSE poll, KV-backed
        ├─► { status: 'pending' } … repeat
        ├─► { status: 'failed', error } → surface error
        └─► { status: 'completed', reportId, preview, summary, totalCount }
              └─► sessionStorage + router.push(`/preview?report_id=…`)

Inngest function `generateReportJob` (steps run independently, retries=0):
  ├─► step 'set-initial-status'   → KV pending
  ├─► step 'generate-report'      → inferNiceClass + generateCandidates
  │                                 + checkAllTrademarks (Signa)
  │                                 + checkAllEuipoTrademarks (LD flag + EU/Global)
  │                                 + checkAllDomains (DNS + RDAP + WhoisJSON)
  │                                 + synthesiseReport
  │                                 + validateReportData / validateGroundedMarks
  │                                 + auto-fix ranking / prefix / topPicks
  ├─► step 'save-report'          → R2 PUT reports/{id}.json
  ├─► step 'save-report-pdf'      → @react-pdf/renderer → R2 PUT reports/{id}.pdf
  │                                 (non-fatal — JSON is source of truth)
  └─► step 'set-completed-status' → KV { status: 'completed', preview, summary, ... }

payment: Stripe Checkout ─► webhook upserts User + ReportRecord (Postgres),
                            dispatches email (Resend)
access:  /api/auth verifies Stripe session + one-time KV nonce
                 → HttpOnly JWT cookie (paid + reportId, optional userId)
                 → /results?report_id=…
```

All upstream I/O inside `generate-report` uses `Promise.allSettled` with graceful
degradation — any single source (Signa, EUIPO, WhoisJSON) failing produces
`risk: uncertain` for affected candidates, not a pipeline failure.

Inngest dev UI runs at <http://localhost:8288> and is started by
`npm run dev:inngest` (already wired into `npm run dev`). The Next.js handler at
`/api/inngest` (`src/app/api/inngest/route.ts`) exposes the function registry via
`serve({ client, functions })`. `INNGEST_DEV=1` is required in `.env.local` —
without it, the SDK boots in cloud mode and `PUT /api/inngest` 500s with
"no signing key found".

### Storage split (R2 vs KV)

- **R2 / S3** is the durable store for generated artifacts: `reports/{id}.json`
  (canonical structured data) and `reports/{id}.pdf` (immutable artifact). Both
  are written eagerly inside the Inngest job. `getReport` / `getReportPdf` are
  `NoSuchKey`-aware and return `null` for missing objects.
- **KV (Upstash Redis)** is now only short-lived state: auth nonces (24h),
  magic-link tokens (15min), and job status (24h). The 7d session cookie /
  JWT TTL still applies to the `session` cookie itself.
- **Postgres (Prisma)** stores the cross-purchase identity layer: `User` rows
  and a `ReportRecord` per paid report, joined by `userId`. The webhook upserts
  both on a paid checkout.

### PDF download

The download button on `/results` is a plain `<a href download>` pointing at
`/api/report/[id]/pdf`. The handler:

1. verifies the session cookie (`paid=true` and either matching `reportId` or
   a `userId` that owns the `ReportRecord`),
2. tries `getReportPdf` from R2 first,
3. on miss, loads the JSON, renders via `@react-pdf/renderer` `renderToBuffer`,
   and write-throughs back to R2 so subsequent downloads hit the stored copy.

This means reports generated before the PDF feature shipped are still
downloadable — the first request takes the render hit, and every request after
serves the cached object.

## Folder layout

```
src/
  app/          ─ Next.js App Router (routes, pages, API handlers)
    api/
      generate              ─ POST: dispatches Inngest event, returns jobId+reportId
      status/[jobId]        ─ GET (SSE): streams KV job status every 3s
      inngest               ─ GET/POST/PUT: Inngest function registry (serve())
      report/[id]/pdf       ─ GET: auth-gated PDF download (R2 + on-demand fallback)
      auth                  ─ GET: Stripe-redirect path → single-report cookie
      auth/magic-link       ─ POST: send 15-min magic-link token (Resend)
      auth/verify           ─ GET: consume token → 30-day userId session cookie
      auth/logout           ─ POST: clear session cookie
      checkout, webhook, preview, health, cron/stripe-reconcile
    my-reports              ─ user-scoped report list (gated on userId session)
  inngest/      ─ client.ts (Inngest singleton) + functions.tsx (generateReportJob)
  components/   ─ IntakeForm, FreePreview, FullReport, CandidateRow, ReportPdfDocument,
                  Header, HeaderClient, LoginModal, etc.
  lib/          ─ anthropic (pipeline + prompts), signa, euipo, dns, db (Prisma),
                  r2 (S3 client + saveReport / getReport / saveReportPdf / getReportPdf),
                  kv (auth nonces, magic-link tokens, job status), session, alerts,
                  cost, flags, email, geography, env, logger
  __tests__/    ─ mirrors lib/ and app/api/
  __mocks__/    ─ jose shim for Jest (ESM-only compat)
  proxy.ts      ─ Next.js 16 middleware (rate limiting on /api/generate)
prisma/         ─ schema.prisma (User, ReportRecord) + seed.ts (dev accounts)
```

## Key technical decisions

- **Next.js 16 App Router** — see `AGENTS.md`: API shapes differ from prior versions, check `node_modules/next/dist/docs/` before touching framework APIs
- **Server Components by default**, `'use client'` only where event handlers require it
- **No `as any`** — use SDK-exported types; `unknown` at trust boundaries with proper narrowing
- **Lazy singleton clients** — `client()` (Anthropic) and `stripe()` both read env at call time, not module-load, so cold-start doesn't fail before `validateEnv()` runs
- **LLM output is not trusted** — every JSON response passes `validateReportData` (field-level + cross-cutting invariants) before reaching the user
- **Auto-fix over throw** — when the LLM produces valid-but-not-quite-right output (unusable candidate missing the prefix, wrong ranking), we silently correct and emit a warn log rather than 502ing the user

## Product positioning

This product **is**: a structured naming tool + preliminary trademark and domain screening, delivered in 90 seconds for $19.

This product **is not**: a brand strategy consultant, and not legal clearance. We don't produce positioning statements, messaging pillars, target audience articulation, tone of voice, or visual identity — those are classically the strategist's domain (expect $5K+ human engagement). We don't certify a name as legally available — that requires a qualified trademark attorney; our role is to surface preliminary signals so the founder enters that conversation informed.

Customers who walk in with implicit strategy already (they know their category, audience, personality) and need defensible name candidates are served well. Customers who need strategic foundations should hire a consultant.

See `docs/ROADMAP.md` for the Tier 2 ("Brand Kit") expansion path that adds positioning + messaging on top of chosen names — post-launch only, gated on user signal.

## Auth flow

There are two parallel auth paths. Both produce the same `session` cookie shape
(an HS256 JWT verified by `verifySession`) but differ in scope and expiry.

### 1. Stripe-redirect path (single-report access)

```
Stripe Checkout ─► success_url with {session_id, report_id, nonce}
  ─► GET /api/auth
      ├─► consumeAuthNonce(session_id, nonce)        (atomic via kv.getdel)
      ├─► stripe.checkout.sessions.retrieve(session_id) — verify paid
      ├─► getReport(reportId) from R2 — verify exists
      └─► signSession(reportId, paid=true, userId?) — 7d JWT
            └─► HttpOnly cookie, maxAge 604800
                  └─► redirect to /results?report_id=…
```

If the visitor already has a `userId` session (because they signed in via magic
link earlier), it's preserved on the new cookie so the same browser tab keeps
multi-report access alongside the freshly-paid report.

Webhook (`/api/webhook`) handles paid-session reconciliation, upserts the
`User` + `ReportRecord` rows in Postgres, and dispatches the email-me-a-copy
attachment via Resend — but **does NOT set cookies** (Stripe webhooks hit our
server, not the browser).

### 2. Magic-link path (multi-report access)

```
LoginModal → POST /api/auth/magic-link { email }
   ├─► prisma.user.findUnique({ email })   ◄── no email enumeration: silent no-op when missing
   ├─► setMagicLink(token, email)          ◄── 15-min KV TTL
   └─► sendMagicLinkEmail(email, url)      ◄── no-op when RESEND_API_KEY unset

User clicks link → GET /api/auth/verify?token=…
   ├─► consumeMagicLink(token)             ◄── atomic, single-use
   ├─► prisma.user.findUnique({ email })
   ├─► signUserSession(userId)             ◄── 30d JWT, paid=true, userId set
   └─► HttpOnly cookie maxAge 30d → redirect to /my-reports

POST /api/auth/logout                      ◄── clears the session cookie
```

`/my-reports` is server-rendered and looks up `ReportRecord` rows by
`session.userId`. The PDF route (`/api/report/[id]/pdf`) accepts either
session shape: a `userId` session must own the report via `ReportRecord`,
otherwise the cookie's single-`reportId` must match the requested id.

### Local test accounts

To test the magic link flow locally without going through Stripe, seed the
local database:

```bash
npx prisma db seed
```

This creates `test@example.com` and `founder@namewright.co`. Enter either
into the "Sign In" modal — without `RESEND_API_KEY` set the email is
suppressed, so look up the token directly via the KV emulator
(`magic_link:*`) and visit `http://localhost:3000/api/auth/verify?token=…`.

## Environment variables

See `.env.example` — every variable has an inline comment explaining its purpose and whether it's required or optional.

Required at runtime: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SESSION_SECRET` (≥32 chars), `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` (Postgres, Prisma), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and either `R2_ACCOUNT_ID` or `R2_ENDPOINT_URL` (the latter for local Minio).

Optional integrations (each gracefully no-ops when its key is absent): `SIGNA_API_KEY`, `WHOISJSON_API_KEY`, `LAUNCHDARKLY_SDK_KEY`, `EUIPO_CLIENT_ID/SECRET`, `SENTRY_DSN`, `SLACK_ALERT_WEBHOOK_URL`, `RESEND_API_KEY`, `CRON_SECRET`.

Inngest: `INNGEST_DEV=1` is required in `.env.local` for the local dev server to register the app; in production set `INNGEST_SIGNING_KEY` from the Inngest dashboard instead.

## Context7 — mandatory for library APIs

Before writing code against any third-party library (Next.js 16, Anthropic SDK, Stripe, jose, @vercel/kv, Tailwind v4, React 19), query Context7 first — this project uses versions with breaking changes from prior releases. Don't rely on training-data-era API shapes.

## Deployment

Vercel, via `vercel --prod` (Git integration not wired; pushes don't auto-deploy). Post-deploy, verify with `curl https://<url>/api/health` — expects `{ status: "ok", kv: { ok: true }, env: { missingRequired: [] } }`.

## Internal audits (snapshot)

This repo has been audited against:

- **Logging** (2026-04-23) — 12 P0/P1/P2 gaps closed
- **Principal-engineer code review** (2026-04-24) — 15 findings across 10 dimensions addressed
- **Accuracy** (2026-04-24) — 7 findings closed (homoglyph fix, WhoisJSON field bug, cross-source signal, validator auto-fix)
- **Product purpose** (2026-04-24) — positioning confirmed consistent with what the landing page claims
- **Complexity** (2026-04-24) — flagged ~380 LOC as premature for pre-launch volume; founder deferred cleanup pending prod validation

Audit scripts live at `scripts/accuracy-audit.mjs` (10-brief regression). Re-run monthly or after prompt changes.
