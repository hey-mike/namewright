@AGENTS.md

# Namewright — Brand Name Research Tool

## Build & Dev

- `npm run dev` — start Next.js dev server + Stripe webhook forwarder (http://localhost:3000)
- `npm run dev:next` — Next.js only (if Stripe CLI isn't installed or not needed)
- `npm run dev:stripe` — Stripe webhook forwarder only (separate terminal)
- `npm run build` — production build
- `npm run test` — run Jest tests
- `npx tsc --noEmit` — type check only

### First-time Stripe CLI setup

The combined `dev` command depends on Stripe CLI (`brew install stripe/stripe-cli/stripe`).
After install, run `stripe login` once to authenticate. The webhook signing secret
printed by `stripe listen` must match `STRIPE_WEBHOOK_SECRET` in `.env.local` — the
CLI reuses the same secret for your device, so you set it once and it works thereafter.

## Stack

- Next.js 16 App Router (see AGENTS.md — breaking changes from prior versions)
- TypeScript strict mode
- Tailwind CSS v4 (`@import "tailwindcss"` — NOT `@tailwind base/components/utilities`)
- `@anthropic-ai/sdk` — lazy singleton via factory function `client()` in `src/lib/anthropic.ts`, reads `ANTHROPIC_API_KEY` at call time (matches `stripe()` pattern so cold-start doesn't fail before `validateEnv()` runs)
- `stripe` v22 — lazy singleton via factory function in `src/lib/stripe.ts`
- `inngest` v4 — event-driven background jobs. Client in `src/inngest/client.ts`, function registry in `src/inngest/functions.tsx`, served via `/api/inngest`. `/api/generate` dispatches `report.generate`; the function runs the synthesis pipeline as discrete `step.run` units (`set-initial-status`, `generate-report`, `save-report`, `save-report-pdf`, `set-completed-status`). Dev UI at <http://localhost:8288>; `INNGEST_DEV=1` is required locally.
- `@prisma/client` v7 + `@prisma/adapter-pg` — Postgres-backed `User` + `ReportRecord` for the multi-report identity layer. Singleton in `src/lib/db.ts`. Schema in `prisma/schema.prisma`; dev seed in `prisma/seed.ts` (`test@example.com`, `founder@namewright.co`).
- `@aws-sdk/client-s3` — durable storage for both `reports/{id}.json` and `reports/{id}.pdf`. Lazy singleton in `src/lib/r2.ts`; `forcePathStyle` toggled when `R2_ENDPOINT_URL` is set (Minio dev). `NoSuchKey` is the only "not found" path — every other failure logs and returns `null`.
- `@react-pdf/renderer` v4 — `renderToBuffer(<ReportPdfDocument />)` in the Inngest `save-report-pdf` step and the on-demand fallback inside `/api/report/[id]/pdf`.
- `@vercel/kv` — Upstash Redis, now scoped to short-lived state only: auth nonces (24h), magic-link tokens (15min), job status (24h). NOT the report store anymore.
- `jose` v6 — HS256 JWT. `signSession(reportId, paid, userId?)` is 7d (Stripe-redirect path); `signUserSession(userId)` is 30d (magic-link path).

## Folder Structure

```
src/
  app/                              — Next.js App Router
    api/
      generate                      — POST: dispatches Inngest event, returns { jobId, reportId }
      status/[jobId]                — GET (SSE): KV-backed job status, 3s poll
      inngest                       — GET/POST/PUT: Inngest function registry
      report/[id]/pdf               — GET: auth-gated PDF (R2 + render-on-demand fallback)
      auth                          — GET: Stripe-redirect single-report cookie
      auth/magic-link               — POST: send 15-min magic-link token
      auth/verify                   — GET: consume token → 30-day userId session
      auth/logout                   — POST: clear session cookie
      checkout, webhook, preview, health, cron/stripe-reconcile
    my-reports                      — server-rendered list, gated on userId session
  inngest/                          — client.ts + functions.tsx (generateReportJob)
  components/                       — IntakeForm, FreePreview, FullReport, ReportPdfDocument,
                                      Header, HeaderClient, LoginModal, etc.
  lib/                              — anthropic, signa, euipo, dns, db (Prisma),
                                      r2 (S3), kv, session, alerts, cost, flags, email
  __tests__/                        — mirrors lib/ and app/api/
  __mocks__/                        — jose shim for Jest (ESM-only compat)
  proxy.ts                          — Next.js 16 rate limiting (file: proxy.ts, export: proxy)
prisma/                             — schema.prisma + seed.ts
```

## Context7 — Mandatory for Library APIs

Before writing any code that uses a library or framework API, you MUST query Context7 first:

1. `mcp__plugin_context7-plugin_context7__resolve-library-id` — resolve the library name
2. `mcp__plugin_context7-plugin_context7__query-docs` — fetch current docs for the specific API

This applies to: Next.js, Anthropic SDK, Stripe, jose, @vercel/kv, Tailwind CSS, Signa SDK, React — any third-party package. Never rely on training data for API shapes, method signatures, or constructor options. Libraries in this project have breaking changes from prior versions.

## Key Conventions

- Server Components by default; `'use client'` only where event handlers needed
- `@/*` path alias resolves to `src/*`
- No `as any` — use proper SDK-exported types
- No workarounds — fix root causes

## Auth Flow

Two parallel paths produce the same `session` cookie shape (HS256 JWT, verified by `verifySession`).

**Stripe-redirect path (single-report, 7d):**
Stripe payment → `/api/auth` GET → consume KV nonce → verify Stripe `payment_status=paid` → `signSession(reportId, paid, userId?)` → HttpOnly cookie (maxAge 604800) → redirect to `/results?report_id=…`. Preserves an existing `userId` from the cookie if present so a logged-in buyer keeps multi-report access on the same browser.

**Magic-link path (multi-report, 30d):**
`POST /api/auth/magic-link { email }` → `prisma.user.findUnique` (silent no-op for unknown emails — no enumeration) → `setMagicLink(token, email)` 15-min KV TTL → Resend email. `GET /api/auth/verify?token=…` → `consumeMagicLink` (atomic) → `signUserSession(userId)` 30d JWT → cookie → redirect to `/my-reports`. `POST /api/auth/logout` clears the cookie.

`/api/webhook` upserts `User` + `ReportRecord` in Postgres on paid checkouts and dispatches the email-me-a-copy attachment, but **does NOT set cookies** (Stripe webhooks hit our server, not the browser).

`/api/report/[id]/pdf` accepts either session shape: a `userId` session must own the `ReportRecord`; otherwise the cookie's `reportId` must match the requested id.

## Product positioning

Namewright is a **naming tool + preliminary trademark/domain screening**, not a brand strategy consultant and not legal clearance. Positioning statements, messaging pillars, target audience articulation, tone-of-voice, and visual identity are explicitly out of scope. Customers bring implicit strategy (via description + personality + geography inputs); we consume it, we don't derive it. Keep this distinction when writing prompts, copy, or new features — reaching upward into consulting scope devalues the core wedge.

See `README.md` ("Product positioning") and `docs/ROADMAP.md` (Tier 2 "Brand Kit" expansion) for the full framing.

## Environment Variables

**Required at runtime** (validateEnv throws if missing):
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SESSION_SECRET` (≥32 chars),
`NEXT_PUBLIC_APP_URL`, `DATABASE_URL` (Postgres for Prisma),
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and either
`R2_ACCOUNT_ID` (Cloudflare R2) or `R2_ENDPOINT_URL` (local Minio).

**Optional integrations** (each gracefully no-ops when unset):

- `SIGNA_API_KEY` — trademark search; without it, risk defaults to uncertain
- `WHOISJSON_API_KEY` — third domain-availability source (1000/month free tier)
- `LAUNCHDARKLY_SDK_KEY` — gates the `euipo-direct-cross-check` flag; defaults to false when unset
- `EUIPO_CLIENT_ID`, `EUIPO_CLIENT_SECRET`, `EUIPO_AUTH_BASE_URL`, `EUIPO_API_BASE_URL` — EUIPO direct cross-check (sandbox by default)
- `SENTRY_DSN` — error tracking
- `SLACK_ALERT_WEBHOOK_URL` — on-call alerts for webhook sig failures, KV save failures, Anthropic credit exhaustion, EUIPO token failures
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` — email-me-a-copy at paywall
- `CRON_SECRET` — Bearer token for `/api/cron/stripe-reconcile`

**Inngest:**

- `INNGEST_DEV=1` — required in `.env.local` for the local Inngest dev server to register the app. Without it, the SDK boots in cloud mode and `PUT /api/inngest` 500s with "no signing key found".
- `INNGEST_SIGNING_KEY` — production-only, from the Inngest dashboard.

**Dev-only flags** (refused in production even if set):

- `DEV_MOCK_PIPELINE=1` — returns canned `ReportData` fixture from `src/lib/__fixtures__/dev-report.ts` instead of calling paid APIs. Per-request override via `x-dev-mock-pipeline: 1|0` header (UI toggle in `IntakeForm.tsx`, dev builds only).

See `.env.example` for inline comments on each.

## Accuracy guardrails (anthropic.ts)

LLM output is untrusted. Every response passes `validateReportData` which:

- Validates field-level shape (style enum, risk enum, domain status enum, TLD normalization)
- Enforces cross-cutting invariants (topPicks name references a real candidate, unusable candidates have UNUSABLE_PREFIX + bottom-rank + not in topPicks)
- Auto-fixes violations silently with matching `auto_fix_*` warn logs rather than 502ing the user
- Detects hallucinated mark citations (`validateGroundedMarks`) and style-distribution drift (`validateStyleDistribution`) as telemetry-only warnings
- Blocks Cyrillic/Greek/emoji homoglyphs in names (`HOMOGLYPH_RE`) — retries once with explicit ASCII instruction before failing
- Retries once on Anthropic 429 rate-limit errors (`callWithRateLimitRetry`)

Don't bypass or loosen these without updating the audit log. Each one closes a measured failure mode; see `docs/ROADMAP.md` for the rationale per guardrail.
